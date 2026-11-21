// Moved from Kansei's helper (stage-2b-voice).
type Point = {lat: number; lon: number};

/** `airport` is the terminal area the fix belongs to (an approach fix name can repeat at other airports in one region). */
export interface FixIndex { find(ident: string, region: string, airport?: string): Point | null }

const NAV_CODES = new Set(['2', '3', '12', '13']);

function key(...parts: string[]): string {
  return parts.join('\0');
}

/** earth_fix rows (`lat lon ident area region ...`) and earth_nav rows of codes 2, 3, 12 and 13 (`code lat lon elev freq range var ident area region ...`). */
export function indexFixes(fixText: string, navText: string): FixIndex {
  const byArea = new Map<string, Point>();
  const enroute = new Map<string, Point>();
  const any = new Map<string, Point>();
  const add = (ident: string | undefined, area: string | undefined, region: string | undefined, lat: number, lon: number): void => {
    if (ident === undefined || area === undefined || region === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const point = {lat, lon};
    if (!byArea.has(key(ident, region, area))) byArea.set(key(ident, region, area), point);
    if (area === 'ENRT' && !enroute.has(key(ident, region))) enroute.set(key(ident, region), point);
    if (!any.has(key(ident, region))) any.set(key(ident, region), point);
  };
  for (const line of fixText.split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f.length < 5) continue;
    add(f[2], f[3], f[4], Number(f[0]), Number(f[1]));
  }
  for (const line of navText.split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f.length < 10 || !NAV_CODES.has(f[0] ?? '')) continue;
    add(f[7], f[8], f[9], Number(f[1]), Number(f[2]));
  }
  return {
    find: (ident, region, airport) =>
      (airport === undefined ? undefined : byArea.get(key(ident, region, airport))) ?? enroute.get(key(ident, region)) ?? any.get(key(ident, region)) ?? null,
  };
}
