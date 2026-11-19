// True and magnetic directions, given the magnetic variation where they are read. Variation is
// positive east, negative west ("east is least"): magnetic = true - variation.

import {WMM2025_COEFFICIENTS, WMM2025_EPOCH} from './wmm2025.ts';

function to360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** A true direction as magnetic, 0 up to 360. */
export function trueToMagnetic(trueDeg: number, variationDeg: number): number {
  return to360(trueDeg - variationDeg);
}

/** A magnetic direction as true, 0 up to 360. */
export function magneticToTrue(magneticDeg: number, variationDeg: number): number {
  return to360(magneticDeg + variationDeg);
}

// ---- World Magnetic Model 2025 ---------------------------------------------------------------------


const WGS84_A = 6378.137; // km
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const WMM_RE = 6371.2; // km, the model's reference radius
const N_MAX = 12;

function decimalYear(d: Date): number {
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  return y + (d.getTime() - start) / (Date.UTC(y + 1, 0, 1) - start);
}

/**
 * Magnetic declination (variation) in degrees, east positive, from NOAA's World Magnetic Model 2025, at a
 * geodetic position, a height above the WGS84 ellipsoid (feet, default 0) and a time (default now). The
 * model is valid 2025.0–2030.0; outside that it is extrapolated and grows less accurate. Unreliable within
 * about 1° of the geographic poles and near the magnetic poles, as any declination is.
 */
export function declination(lat: number, lon: number, altFt = 0, date: Date = new Date()): number {
  const t = decimalYear(date) - WMM2025_EPOCH;
  const h = (altFt * 0.3048) / 1000;
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;

  // Geodetic to geocentric spherical.
  const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
  const rn = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
  const p = (rn + h) * cosPhi;
  const z = (rn * (1 - WGS84_E2) + h) * sinPhi;
  const r = Math.hypot(p, z);
  const phiC = Math.asin(z / r);

  // Schmidt semi-normalized associated Legendre functions of cos(colatitude) and their θ-derivatives.
  const ct = Math.sin(phiC); // cos θ
  const st = Math.max(Math.cos(phiC), 1e-12); // sin θ
  const P: number[][] = Array.from({length: N_MAX + 1}, () => new Array<number>(N_MAX + 1).fill(0));
  const dP: number[][] = Array.from({length: N_MAX + 1}, () => new Array<number>(N_MAX + 1).fill(0));
  P[0]![0] = 1;
  for (let n = 1; n <= N_MAX; n++) {
    for (let m = 0; m <= n; m++) {
      if (m === n) {
        const k = n === 1 ? 1 : Math.sqrt((2 * n - 1) / (2 * n));
        P[n]![n] = k * st * P[n - 1]![n - 1]!;
        dP[n]![n] = k * (ct * P[n - 1]![n - 1]! + st * dP[n - 1]![n - 1]!);
      } else {
        const a = Math.sqrt(n * n - m * m);
        const b = n >= 2 ? Math.sqrt((n - 1) * (n - 1) - m * m) : 0;
        const p2 = n >= 2 ? P[n - 2]![m]! : 0;
        const dp2 = n >= 2 ? dP[n - 2]![m]! : 0;
        P[n]![m] = ((2 * n - 1) * ct * P[n - 1]![m]! - b * p2) / a;
        dP[n]![m] = ((2 * n - 1) * (ct * dP[n - 1]![m]! - st * P[n - 1]![m]!) - b * dp2) / a;
      }
    }
  }

  // Field components in the geocentric frame (X' north, Y' east, Z' down).
  let xc = 0, yc = 0, zc = 0;
  for (const [n, m, g0, h0, gd, hd] of WMM2025_COEFFICIENTS) {
    const g = g0 + gd * t, hh = h0 + hd * t;
    const ratio = (WMM_RE / r) ** (n + 2);
    const cosM = Math.cos(m * lam), sinM = Math.sin(m * lam);
    const gc = g * cosM + hh * sinM;
    xc += ratio * gc * dP[n]![m]!;
    yc += ratio * m * (g * sinM - hh * cosM) * P[n]![m]! / st;
    zc += -(n + 1) * ratio * gc * P[n]![m]!;
  }
  // Back to geodetic north.
  const d = phiC - phi;
  const x = xc * Math.cos(d) - zc * Math.sin(d);
  return (Math.atan2(yc, x) * 180) / Math.PI;
}
