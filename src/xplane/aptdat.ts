// Reader for X-Plane's global airport file, `Global Scenery/Global Airports/Earth nav data/apt.dat`
// (APT1100 and later). Streaming: it takes the text as chunks (split anywhere, LF or CRLF) and yields one
// airport at a time, so a caller can read a file of several hundred MB without holding it.
//
// Read, per airport:
//   1 / 16 / 17   header: land airport / seaplane base / heliport —
//                 `<code> <elevation ft> <unused> <unused> <ident> <name…>`
//   1302          metadata: `1302 <key> <value…>`, kept as written
//   100           land runway: `100 <width m> <surface> <shoulder> <smoothness> <centre lights> <edge lights>
//                 <signs>` then two ends of `<ident> <lat> <lon> <displaced m> <overrun m> <markings>
//                 <approach lights> <TDZ> <REIL>`
//   1050–1056     frequencies in kHz (`1051 118100 TWR` → 118.1 MHz)
//   50–56         frequencies in tens of kHz (`54 11810 TWR` → 118.1 MHz)
// Everything else (taxiways, signs, water runways 101, helipads 102, …) is passed over. `99` ends the file.
// Never throws: a bad row is skipped; a header without an ident skips that airport and its rows.

export interface AptDatRunwayEnd {
  ident: string;
  lat: number;
  lon: number;
  /** Displaced threshold, metres; null when unreadable. */
  displacedM: number | null;
}

export interface AptDatRunway {
  widthM: number | null;
  /** Surface code as written (1 asphalt, 2 concrete, 3 grass, …); null when unreadable. */
  surface: number | null;
  ends: AptDatRunwayEnd[];
}

export interface AptDatFrequency {
  /** The row code: 1050–1056, or 50–56 in older files. */
  code: number;
  mhz: number;
  name: string;
}

export interface AptDatAirport {
  kind: 'land' | 'sea' | 'heli';
  ident: string;
  name: string;
  elevationFt: number | null;
  /** Row 1302 key/value pairs, as written. */
  meta: Record<string, string>;
  /** Row 100 (land runways) only. */
  runways: AptDatRunway[];
  frequencies: AptDatFrequency[];
}

const KINDS: Readonly<Record<string, AptDatAirport['kind']>> = {'1': 'land', '16': 'sea', '17': 'heli'};

const num = (s: string | undefined): number | null => {
  if (s === undefined || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
};

/** The airports in apt.dat text, one at a time. */
export async function* readAptDat(text: AsyncIterable<string>): AsyncGenerator<AptDatAirport> {
  let current: AptDatAirport | null = null;
  let skipping = false;
  let rest = '';

  const line = (raw: string): AptDatAirport | 'end' | null => {
    const l = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const trimmed = l.trim();
    if (trimmed === '') return null;
    const code = trimmed.split(/\s+/, 1)[0]!;
    if (code === '99') return 'end';
    const kind = KINDS[code];
    if (kind !== undefined) {
      const done = current;
      const f = trimmed.split(/\s+/);
      const ident = f[4];
      if (ident === undefined || ident === '') {
        current = null;
        skipping = true;
      } else {
        const name = trimmed.replace(/^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s*/, '');
        current = {kind, ident, name, elevationFt: num(f[1]), meta: {}, runways: [], frequencies: []};
        skipping = false;
      }
      return done;
    }
    if (current === null || skipping) return null;
    if (code === '1302') {
      const m = /^1302\s+(\S+)(?:\s+(.*))?$/.exec(trimmed);
      if (m !== null) current.meta[m[1]!] = (m[2] ?? '').trim();
    } else if (code === '100') {
      const f = trimmed.split(/\s+/);
      const end = (i: number): AptDatRunwayEnd | null => {
        const ident = f[i], lat = num(f[i + 1]), lon = num(f[i + 2]);
        if (ident === undefined || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
        return {ident, lat, lon, displacedM: num(f[i + 3])};
      };
      const a = end(8), b = end(17);
      if (a !== null && b !== null) current.runways.push({widthM: num(f[1]), surface: num(f[2]), ends: [a, b]});
    } else {
      const n = Number(code);
      const isNew = n >= 1050 && n <= 1056, isOld = n >= 50 && n <= 56;
      if (isNew || isOld) {
        const m = /^\S+\s+(\d+)(?:\s+(.*))?$/.exec(trimmed);
        if (m !== null) current.frequencies.push({code: n, mhz: Number(m[1]) / (isNew ? 1000 : 100), name: (m[2] ?? '').trim()});
      }
    }
    return null;
  };

  for await (const chunk of text) {
    const parts = (rest + chunk).split('\n');
    rest = parts.pop() ?? '';
    for (const p of parts) {
      const r = line(p);
      if (r === 'end') {
        if (current !== null) yield current;
        return;
      }
      if (r !== null) yield r;
    }
  }
  const r = line(rest);
  if (r !== null && r !== 'end') yield r;
  if (current !== null) yield current;
}
