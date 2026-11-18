import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createSimReader, simBaseFromUrl, type SimReader, type SimState} from './read.ts';

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

const fakeFetch = (async (url: string) => {
  urls.push(String(url));
  if (failFetches > 0) {
    failFetches--;
    throw new Error('network down');
  }
  const u = String(url);
  if (u.endsWith('/api/capabilities')) return {ok: true, json: async () => ({api: {versions}})};
  const name = decodeURIComponent(u.split('filter[name]=')[1] ?? '');
  return {ok: true, json: async () => ({data: table[name] === undefined ? [] : [{id: table[name], name}]})};
}) as unknown as typeof fetch;

const base = {httpBase: 'http://sim', wsBase: 'ws://sim'};
const datarefs = {com: 'sim/a', lat: 'sim/b'};

function make(required: ('com' | 'lat')[] = ['com', 'lat']): {reader: SimReader<'com' | 'lat'>; states: SimState[]; values: Partial<Record<'com' | 'lat', unknown>>[]} {
  const reader = createSimReader({base, datarefs, required, fetch: fakeFetch, WebSocket: FakeSocket, now: () => 7});
  const states: SimState[] = [];
  const values: Partial<Record<'com' | 'lat', unknown>>[] = [];
  reader.onState((s) => states.push(s));
  reader.onValues((v) => values.push(v));
  return {reader, states, values};
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
});
afterEach(() => {
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
