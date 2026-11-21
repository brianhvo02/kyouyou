// Moved from Kansei's helper (stage-2b-voice).
import type {Msa, MsaSector, RunwayEnd} from './types.ts';
import type {FixIndex} from './fixes.ts';

/**
 * The minimum safe altitudes of one airport from earth_msa.dat text. A row is
 * `<type> <centre> <region> <airport> <M|T> (<bearing> <alt/100> <radius>)* 000 000 <n>`.
 * A runway centre ('RW28L') is placed at that runway's threshold, else at the airport. A centre that is neither is left out.
 */
export function msaFor(airportId: string, msaText: string, fixes: FixIndex, airportLatLon: {lat: number; lon: number}, runways: readonly RunwayEnd[] = []): Msa[] {
  const out: Msa[] = [];
  for (const line of msaText.split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f.length < 7 || f[3] !== airportId) continue;
    const [, centre, region, , mode] = f;
    if (centre === undefined || region === undefined || (mode !== 'M' && mode !== 'T')) continue;
    const end = centre.startsWith('RW') ? runways.find((r) => r.name === centre.slice(2)) : undefined;
    const where = centre === airportId ? airportLatLon : end ? {lat: end.lat, lon: end.lon} : centre.startsWith('RW') ? airportLatLon : fixes.find(centre, region, airportId);
    if (where === null) continue;
    const sectors: MsaSector[] = [];
    for (let i = 5; i + 2 < f.length; i += 3) {
      if (f[i] === '000' && f[i + 1] === '000') break;
      const fromDeg = Number(f[i]);
      const ft = Number(f[i + 1]) * 100;
      const radiusNm = Number(f[i + 2]);
      if (!Number.isFinite(fromDeg) || !Number.isFinite(ft) || !Number.isFinite(radiusNm)) break;
      sectors.push({fromDeg, ft, radiusNm});
    }
    if (sectors.length === 0) continue;
    out.push({centre, lat: where.lat, lon: where.lon, magnetic: mode === 'M', sectors});
  }
  return out;
}
