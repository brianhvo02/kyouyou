import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createSimReader, decodeText, simBaseFromUrl, type SimReader, type SimState} from './read.ts';

class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: {data: unknown}) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closed = false;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
  }
  static get last(): FakeSocket {
    return FakeSocket.all[FakeSocket.all.length - 1];
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.onopen?.();
  }
  message(obj: unknown): void {
    this.onmessage?.({data: typeof obj === 'string' ? obj : JSON.stringify(obj)});
  }
  drop(): void {
    this.onclose?.();
  }
}

let table: Record<string, number>;
let versions: string[];
let failFetches: number;
let urls: string[];
let hang: (url: string) => boolean; // a request this matches never answers (and ignores its signal)
let signals: {url: string; signal: AbortSignal | undefined; init: RequestInit | undefined}[];
let flightCount: number;
let failCount: boolean;
let values: Record<number, unknown>; // value of a dataref, by id, for the single-value read

const fakeFetch = (async (url: string, init?: RequestInit) => {
  urls.push(String(url));
  signals.push({url: String(url), signal: init?.signal ?? undefined, init});
  if (hang(String(url))) return new Promise(() => {});
  if (failFetches > 0) {
    failFetches--;
    throw new Error('network down');
  }
  const u = String(url);
  if (u.endsWith('/api/capabilities')) return {ok: true, json: async () => ({api: {versions}})};
  if (u.endsWith('/api/v3/datarefs/count')) {
    if (failCount) return {ok: false, status: 500, json: async () => ({})};
    return {ok: true, json: async () => ({data: flightCount})};
  }
  const valueId = /\/api\/v3\/datarefs\/(\d+)\/value$/.exec(u)?.[1];
  if (valueId !== undefined) return {ok: true, json: async () => ({data: values[Number(valueId)]})};
  const name = decodeURIComponent(u.split('filter[name]=')[1] ?? '');
  return {ok: true, json: async () => ({data: table[name] === undefined ? [] : [{id: table[name], name}]})};
}) as unknown as typeof fetch;

const base = {httpBase: 'http://sim', wsBase: 'ws://sim'};
const datarefs = {com: 'sim/a', lat: 'sim/b'};

type Key = 'com' | 'lat';

function make(required: Key[] | null = ['com', 'lat'], timeoutMs?: number): {reader: SimReader<Key>; states: SimState[]; values: Partial<Record<Key, unknown>>[]} {
  const reader = createSimReader({base, datarefs, required: required ?? undefined, timeoutMs, fetch: fakeFetch, WebSocket: FakeSocket, now: () => 7});
  const states: SimState[] = [];
  const values: Partial<Record<Key, unknown>>[] = [];
  reader.onState((s) => states.push(s));
  reader.onValues((v) => values.push(v));
  return {reader, states, values};
}

/** Connects the reader and brings it to `connected`. */
async function connectUp(reader: SimReader<Key>): Promise<void> {
  reader.connect();
  await settle();
  FakeSocket.last.open();
  FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 1, '22': 2}});
  expect(reader.state).toBe('connected');
}

const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.all = [];
  table = {'sim/a': 11, 'sim/b': 22};
  versions = ['v1', 'v2', 'v3'];
  failFetches = 0;
  urls = [];
  hang = () => false;
  signals = [];
  flightCount = 100;
  failCount = false;
  values = {};
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('simBaseFromUrl', () => {
  it('maps http to ws and https to wss, trimming a trailing slash', () => {
    expect(simBaseFromUrl('https://pc.example.ts.net/')).toEqual({httpBase: 'https://pc.example.ts.net', wsBase: 'wss://pc.example.ts.net'});
    expect(simBaseFromUrl('http://localhost:8787')).toEqual({httpBase: 'http://localhost:8787', wsBase: 'ws://localhost:8787'});
    expect(simBaseFromUrl('https://host:1/x/')).toEqual({httpBase: 'https://host:1/x', wsBase: 'wss://host:1/x'});
  });
});

describe('createSimReader', () => {
  it('does nothing before connect', async () => {
    const {reader} = make();
    await settle();
    expect(urls).toEqual([]);
    expect(FakeSocket.all).toHaveLength(0);
    expect(reader.state).toBe('off');
  });

  it('subscribes to the ids of the datarefs the caller named', async () => {
    const {reader, states} = make();
    reader.connect();
    expect(reader.state).toBe('connecting');
    await settle();
    expect(urls).toContain('http://sim/api/capabilities');
    expect(urls).toContain('http://sim/api/v3/datarefs?filter[name]=sim%2Fa');
    expect(FakeSocket.last.url).toBe('ws://sim/api/v3');
    FakeSocket.last.open();
    expect(FakeSocket.last.sent).toHaveLength(1);
    const msg = JSON.parse(FakeSocket.last.sent[0]) as {type: string; params: {datarefs: {id: number}[]}};
    expect(msg.type).toBe('dataref_subscribe_values');
    expect(msg.params.datarefs).toEqual([{id: 11}, {id: 22}]);
    expect(states).toEqual(['connecting']);
  });

  it('merges partial updates and reports by caller key', async () => {
    const {reader, values} = make();
    reader.connect();
    await settle();
    FakeSocket.last.open();
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 121800}});
    FakeSocket.last.message({type: 'dataref_update_values', data: {'22': 37.6}});
    expect(values[values.length - 1]).toEqual({com: 121800, lat: 37.6});
  });

  it('passes the time of the update to onValues', async () => {
    const {reader} = make();
    const ats: number[] = [];
    reader.onValues((_v, at) => ats.push(at));
    reader.connect();
    await settle();
    FakeSocket.last.open();
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 1}});
    expect(ats).toEqual([7]);
  });

  it('is connected only once every required key has a value', async () => {
    const {reader, states} = make();
    reader.connect();
    await settle();
    FakeSocket.last.open();
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 121800}});
    expect(reader.state).toBe('connecting');
    FakeSocket.last.message({type: 'dataref_update_values', data: {'22': 37.6}});
    expect(reader.state).toBe('connected');
    expect(states).toEqual(['connecting', 'connected']);
  });

  it('an optional dataref that is not found is left out, not fatal', async () => {
    delete table['sim/b'];
    const {reader, values} = make(['com']);
    reader.connect();
    await settle();
    FakeSocket.last.open();
    const msg = JSON.parse(FakeSocket.last.sent[0]) as {params: {datarefs: unknown[]}};
    expect(msg.params.datarefs).toEqual([{id: 11}]);
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 5}});
    expect(reader.state).toBe('connected');
    expect(values[0]).toEqual({com: 5});
  });

  it('a required dataref that is not found means unavailable', async () => {
    delete table['sim/b'];
    const {reader} = make();
    reader.connect();
    await settle();
    expect(reader.state).toBe('unavailable');
    expect(FakeSocket.all).toHaveLength(0);
  });

  it('an API without v3 means unavailable', async () => {
    versions = ['v1', 'v2'];
    const {reader} = make();
    reader.connect();
    await settle();
    expect(reader.state).toBe('unavailable');
    expect(FakeSocket.all).toHaveLength(0);
  });

  it('retries with backoff and recovers', async () => {
    const {reader} = make();
    failFetches = 2;
    reader.connect();
    await settle();
    expect(reader.state).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(999);
    expect(reader.state).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(1);
    expect(reader.state).toBe('unavailable'); // second attempt failed too
    await vi.advanceTimersByTimeAsync(1999);
    expect(FakeSocket.all).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(reader.state).toBe('connecting');
    FakeSocket.last.open();
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 1, '22': 2}});
    expect(reader.state).toBe('connected');
  });

  it('keeps the last backoff step repeating and resets it after a connection', async () => {
    versions = [];
    const {reader} = make();
    reader.connect();
    await settle();
    const seen: number[] = [];
    for (const delay of [1000, 2000, 4000, 8000, 15000, 15000]) {
      const before = urls.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(urls.length).toBe(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(urls.length).toBeGreaterThan(before);
      seen.push(delay);
    }
    expect(seen).toHaveLength(6);
    versions = ['v3'];
    await vi.advanceTimersByTimeAsync(15000);
    FakeSocket.last.open();
    FakeSocket.last.drop();
    expect(reader.state).toBe('unavailable');
    const before = urls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(urls.length).toBeGreaterThan(before);
  });

  it('goes unavailable when the socket closes or errors, then reconnects', async () => {
    const {reader} = make();
    reader.connect();
    await settle();
    FakeSocket.last.open();
    FakeSocket.last.onerror?.();
    expect(reader.state).toBe('unavailable');
    expect(FakeSocket.all[0].closed).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('looks ids up again after a reconnect', async () => {
    const {reader, values} = make();
    reader.connect();
    await settle();
    FakeSocket.last.open();
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 1, '22': 2}});
    FakeSocket.last.drop();
    table['sim/a'] = 91;
    await vi.advanceTimersByTimeAsync(1000);
    FakeSocket.last.open();
    const msg = JSON.parse(FakeSocket.last.sent[0]) as {params: {datarefs: unknown[]}};
    expect(msg.params.datarefs).toEqual([{id: 91}, {id: 22}]);
    const count = values.length;
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 5}});
    expect(values).toHaveLength(count);
    FakeSocket.last.message({type: 'dataref_update_values', data: {'91': 9}});
    expect(values[values.length - 1]).toEqual({com: 9}); // old merged values were cleared
  });

  it('disconnect cancels a pending retry and reports off', async () => {
    const {reader} = make();
    failFetches = 1;
    reader.connect();
    await settle();
    expect(reader.state).toBe('unavailable');
    reader.disconnect();
    expect(reader.state).toBe('off');
    const before = urls.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(urls.length).toBe(before);
  });

  it('disconnect closes the socket', async () => {
    const {reader} = make();
    reader.connect();
    await settle();
    FakeSocket.last.open();
    reader.disconnect();
    expect(FakeSocket.last.closed).toBe(true);
    expect(reader.state).toBe('off');
  });

  it('ignores messages that are not JSON objects or not updates', async () => {
    const {reader, values} = make();
    reader.connect();
    await settle();
    FakeSocket.last.open();
    FakeSocket.last.message('not json');
    FakeSocket.last.message('null');
    FakeSocket.last.message('5');
    FakeSocket.last.message({type: 'result', req_id: 1, success: true});
    FakeSocket.last.message({type: 'dataref_update_values', data: null});
    expect(values).toHaveLength(0);
    expect(reader.state).toBe('connecting');
  });

  it('stops calling a callback once it is unsubscribed', async () => {
    const {reader} = make();
    const seen: unknown[] = [];
    const off = reader.onValues((v) => seen.push(v));
    off();
    reader.connect();
    await settle();
    FakeSocket.last.open();
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 1}});
    expect(seen).toEqual([]);
  });
});

describe('timeouts', () => {
  it('a capabilities request that never answers gives unavailable after the timeout, then retries', async () => {
    hang = (u) => u.endsWith('/api/capabilities');
    const {reader} = make();
    reader.connect();
    await vi.advanceTimersByTimeAsync(7999);
    expect(reader.state).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1);
    expect(reader.state).toBe('unavailable');
    expect(signals[0].signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(reader.state).toBe('connecting');
    expect(urls.filter((u) => u.endsWith('/api/capabilities'))).toHaveLength(2);
  });

  it('honours a custom timeoutMs', async () => {
    hang = (u) => u.endsWith('/api/capabilities');
    const {reader} = make(['com', 'lat'], 500);
    reader.connect();
    await vi.advanceTimersByTimeAsync(499);
    expect(reader.state).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1);
    expect(reader.state).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(1000);
    expect(reader.state).toBe('connecting');
    expect(urls.filter((u) => u.endsWith('/api/capabilities'))).toHaveLength(2);
  });

  it('a lookup that never answers gives unavailable after the timeout', async () => {
    hang = (u) => u.includes('filter[name]=sim%2Fb');
    const {reader} = make();
    reader.connect();
    await vi.advanceTimersByTimeAsync(7999);
    expect(reader.state).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1);
    expect(reader.state).toBe('unavailable');
    expect(FakeSocket.all).toHaveLength(0);
  });

  it('a lookup of an optional dataref that never answers also fails the attempt', async () => {
    hang = (u) => u.includes('filter[name]=sim%2Fb');
    const {reader} = make(['com']);
    reader.connect();
    await vi.advanceTimersByTimeAsync(8000);
    expect(reader.state).toBe('unavailable');
    expect(FakeSocket.all).toHaveLength(0);
  });

  it('a socket that never opens is closed after the timeout and retried', async () => {
    const {reader} = make();
    reader.connect();
    await settle();
    expect(FakeSocket.all).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(7999);
    expect(FakeSocket.all[0].closed).toBe(false);
    expect(reader.state).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.all[0].closed).toBe(true);
    expect(reader.state).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('a socket that opens in time is not closed by the timeout', async () => {
    const {reader} = make();
    await connectUp(reader);
    await vi.advanceTimersByTimeAsync(60000);
    expect(FakeSocket.all[0].closed).toBe(false);
    expect(reader.state).toBe('connected');
  });
});

describe('no flight loaded', () => {
  it('a dataref count of zero gives no-flight and keeps retrying, then connects when a flight is loaded', async () => {
    flightCount = 0;
    const {reader, states} = make();
    reader.connect();
    await settle();
    expect(reader.state).toBe('no-flight');
    expect(urls).toContain('http://sim/api/v3/datarefs/count');
    expect(FakeSocket.all).toHaveLength(0);
    for (const delay of [1000, 2000, 4000, 8000, 15000, 15000]) {
      const before = urls.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(urls.length).toBe(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(urls.length).toBeGreaterThan(before);
      expect(reader.state).toBe('no-flight');
    }
    flightCount = 5;
    await vi.advanceTimersByTimeAsync(15000);
    FakeSocket.last.open();
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 1, '22': 2}});
    expect(reader.state).toBe('connected');
    expect(states).not.toContain('unavailable');
  });

  it('a failed count request gives unavailable, not no-flight', async () => {
    failCount = true;
    const {reader, states} = make();
    reader.connect();
    await settle();
    expect(reader.state).toBe('unavailable');
    expect(states).not.toContain('no-flight');
  });

  it('a count request that never answers gives unavailable after the timeout', async () => {
    hang = (u) => u.endsWith('/datarefs/count');
    const {reader} = make();
    reader.connect();
    await vi.advanceTimersByTimeAsync(8000);
    expect(reader.state).toBe('unavailable');
  });
});

describe('subscription result', () => {
  it('a refused subscription gives unavailable and retries', async () => {
    const {reader} = make();
    reader.connect();
    await settle();
    FakeSocket.last.open();
    FakeSocket.last.message({type: 'result', req_id: 1, success: false});
    expect(reader.state).toBe('unavailable');
    expect(FakeSocket.all[0].closed).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('the subscribe message carries the req_id the result is matched against', async () => {
    const {reader} = make();
    reader.connect();
    await settle();
    FakeSocket.last.open();
    const sent = JSON.parse(FakeSocket.last.sent[0]) as {req_id: number};
    FakeSocket.last.message({type: 'result', req_id: sent.req_id + 1, success: false});
    expect(reader.state).toBe('connecting');
    FakeSocket.last.message({type: 'result', req_id: sent.req_id, success: false});
    expect(reader.state).toBe('unavailable');
  });

  it('a successful subscription result is ignored', async () => {
    const {reader, values} = make();
    reader.connect();
    await settle();
    FakeSocket.last.open();
    FakeSocket.last.message({type: 'result', req_id: 1, success: true});
    expect(reader.state).toBe('connecting');
    expect(FakeSocket.all[0].closed).toBe(false);
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 1, '22': 2}});
    expect(reader.state).toBe('connected');
    expect(values).toHaveLength(1);
  });
});

describe('read', () => {
  it('read returns the values of the named datarefs and leaves out unknown names', async () => {
    table['sim/c'] = 33;
    values[33] = 'QUJD';
    values[11] = [1, 2, 3];
    const {reader} = make();
    await connectUp(reader);
    const out = await reader.read(['sim/c', 'sim/a', 'sim/nope']);
    expect(out).toEqual({'sim/c': 'QUJD', 'sim/a': [1, 2, 3]});
    expect(urls).toContain('http://sim/api/v3/datarefs/33/value');
    expect(reader.state).toBe('connected');
  });

  it('read only makes GET requests and sends nothing over the socket', async () => {
    values[11] = 4;
    const {reader} = make();
    await connectUp(reader);
    await reader.read(['sim/a']);
    for (const s of signals) expect(Object.keys(s.init ?? {})).toEqual(['signal']);
    expect(FakeSocket.last.sent).toHaveLength(1);
  });

  it('read remembers ids for the life of the connection', async () => {
    values[11] = 4;
    const {reader} = make();
    await connectUp(reader);
    await reader.read(['sim/a']);
    await reader.read(['sim/a']);
    expect(urls.filter((u) => u.includes('filter[name]=sim%2Fa'))).toHaveLength(2); // one for subscribing, one for read
  });

  it('read rejects when not connected', async () => {
    const {reader} = make();
    await expect(reader.read(['sim/a'])).rejects.toThrow(/not connected/);
    reader.connect();
    await settle();
    await expect(reader.read(['sim/a'])).rejects.toThrow(/not connected/);
    expect(urls.filter((u) => u.endsWith('/value'))).toEqual([]);
  });

  it('read rejects on a failed request and the state is unchanged', async () => {
    const {reader} = make();
    await connectUp(reader);
    table['sim/c'] = 33;
    failFetches = 1;
    await expect(reader.read(['sim/c'])).rejects.toThrow('network down');
    expect(reader.state).toBe('connected');
  });

  it('read rejects on a timeout and the subscription carries on', async () => {
    const {reader, values: got} = make();
    await connectUp(reader);
    hang = (u) => u.includes('filter[name]=sim%2Fz');
    const pending = reader.read(['sim/z']);
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
    expect(reader.state).toBe('connected');
    const count = got.length;
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 9}});
    expect(got).toHaveLength(count + 1);
  });

  it('read looks ids up again after a reconnect', async () => {
    values[11] = 1;
    values[91] = 2;
    const {reader} = make();
    await connectUp(reader);
    expect(await reader.read(['sim/a'])).toEqual({'sim/a': 1});
    FakeSocket.last.drop();
    table['sim/a'] = 91;
    await vi.advanceTimersByTimeAsync(1000);
    FakeSocket.last.open();
    FakeSocket.last.message({type: 'dataref_update_values', data: {'91': 5, '22': 5}});
    expect(reader.state).toBe('connected');
    expect(await reader.read(['sim/a'])).toEqual({'sim/a': 2});
    expect(urls).toContain('http://sim/api/v3/datarefs/91/value');
  });

  it('disconnect rejects a pending read and aborts requests in flight', async () => {
    const {reader} = make();
    await connectUp(reader);
    hang = (u) => u.includes('filter[name]=sim%2Fz');
    const pending = reader.read(['sim/z']);
    const assertion = expect(pending).rejects.toThrow(/aborted/);
    await settle();
    const sig = signals[signals.length - 1];
    expect(sig.url).toContain('sim%2Fz');
    expect(sig.signal?.aborted).toBe(false);
    reader.disconnect();
    await assertion;
    expect(sig.signal?.aborted).toBe(true);
    expect(reader.state).toBe('off');
  });

  it('disconnect during connection aborts the request in flight and nothing retries', async () => {
    hang = (u) => u.endsWith('/api/capabilities');
    const {reader} = make();
    reader.connect();
    await settle();
    reader.disconnect();
    expect(signals[0].signal?.aborted).toBe(true);
    const before = urls.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(urls.length).toBe(before);
    expect(reader.state).toBe('off');
  });
});

describe('callbacks', () => {
  it('a throwing onValues callback does not stop other callbacks or the connection', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const {reader, values: got} = make();
    reader.onValues(() => {
      throw new Error('boom');
    });
    const later: unknown[] = [];
    reader.onValues((v) => later.push(v));
    reader.connect();
    await settle();
    FakeSocket.last.open();
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 1, '22': 2}});
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 3}});
    expect(got).toHaveLength(2);
    expect(later).toHaveLength(2);
    expect(reader.state).toBe('connected');
    expect(FakeSocket.all[0].closed).toBe(false);
    expect(err).toHaveBeenCalledTimes(2);
  });

  it('a throwing onState callback does not stop other callbacks', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const {reader} = make();
    reader.onState(() => {
      throw new Error('boom');
    });
    const later: SimState[] = [];
    reader.onState((s) => later.push(s));
    reader.connect();
    await settle();
    FakeSocket.last.open();
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 1, '22': 2}});
    expect(later).toEqual(['connecting', 'connected']);
    expect(reader.state).toBe('connected');
    expect(err).toHaveBeenCalledTimes(2);
  });
});

describe('required', () => {
  it('required is optional', async () => {
    const {reader, states} = make(null);
    reader.connect();
    await settle();
    FakeSocket.last.open();
    expect(reader.state).toBe('connecting');
    FakeSocket.last.message({type: 'dataref_update_values', data: {'11': 1}});
    expect(reader.state).toBe('connected');
    expect(states).toEqual(['connecting', 'connected']);
  });
});

const b64 = (bytes: number[]): string => btoa(String.fromCharCode(...bytes));
const padded = (text: string, size: number): number[] => {
  const bytes = [...new TextEncoder().encode(text)];
  while (bytes.length < size) bytes.push(0);
  return bytes;
};

describe('decodeText', () => {
  it('decodeText reads text up to the first NUL', () => {
    expect(decodeText(b64(padded('F8X', 40)))).toBe('F8X');
    expect(decodeText(b64([...padded('AB', 4), 67, 68]))).toBe('AB');
  });

  it('decodeText handles text with no padding', () => {
    expect(decodeText(b64(padded('C172', 4)))).toBe('C172');
    expect(decodeText('RkE4WAAAAA==')).toBe('FA8X');
  });

  it('decodeText decodes UTF-8', () => {
    expect(decodeText(b64(padded('Cessna Skyhawk \u00e9\u30bb', 40)))).toBe('Cessna Skyhawk \u00e9\u30bb');
  });

  it('decodeText returns null for a number, an array, undefined and invalid base64', () => {
    expect(decodeText(5)).toBeNull();
    expect(decodeText([1, 2])).toBeNull();
    expect(decodeText(undefined)).toBeNull();
    expect(decodeText('not base64 !!')).toBeNull();
  });

  it('decodeText of an all-NUL buffer is the empty string', () => {
    expect(decodeText(b64(padded('', 16)))).toBe('');
    expect(decodeText('')).toBe('');
  });
});
