/** ISA atmosphere helpers (ICAO Doc 7488 standard atmosphere). */

/**
 * Pressure levels Open-Meteo serves for GFS. 350/450/550/650/750 hPa verified live on
 * 2026-11-08 (api.open-meteo.com/v1/gfs returned numbers for wind_speed_*, wind_direction_*
 * and temperature_* at each, over the full 16-day range, like 250 hPa).
 */
export const GFS_LEVELS_HPA: readonly number[] = [
  1000, 975, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200, 150, 100,
];

const SEA_LEVEL_TEMP_C = 15;
const SEA_LEVEL_HPA = 1013.25;
const LAPSE_C_PER_FT = 0.0019812;
const TROPOPAUSE_FT = 36089;
const STRATO_TEMP_C = -56.5;
const TROPOPAUSE_HPA = 226.3206;
const STRATO_SCALE_FT = 20805.7;
const KELVIN = 273.15;
/** Speed of sound at ISA sea level, knots. */
const A0_KT = 661.4786;

/** ISA temperature in deg C at a geometric altitude in feet. */
export function isaTempC(altFt: number): number {
  if (altFt >= TROPOPAUSE_FT) return STRATO_TEMP_C;
  return SEA_LEVEL_TEMP_C - LAPSE_C_PER_FT * altFt;
}

/** ISA static pressure in hPa at an altitude in feet. */
export function pressureHpa(altFt: number): number {
  if (altFt >= TROPOPAUSE_FT) {
    return TROPOPAUSE_HPA * Math.exp(-(altFt - TROPOPAUSE_FT) / STRATO_SCALE_FT);
  }
  const ratio = (SEA_LEVEL_TEMP_C + KELVIN - LAPSE_C_PER_FT * altFt) / (SEA_LEVEL_TEMP_C + KELVIN);
  return SEA_LEVEL_HPA * Math.pow(ratio, 5.25588);
}

/** Open-Meteo GFS pressure level nearest the ISA pressure at FL x 100 ft. */
export function flToHpaLevel(fl: number): number {
  const p = pressureHpa(fl * 100);
  let best = GFS_LEVELS_HPA[0] ?? 1000;
  for (const level of GFS_LEVELS_HPA) {
    if (Math.abs(level - p) < Math.abs(best - p)) best = level;
  }
  return best;
}

function speedOfSoundKt(altFt: number, isaDevC: number): number {
  const tK = isaTempC(altFt) + isaDevC + KELVIN;
  return A0_KT * Math.sqrt(tK / (SEA_LEVEL_TEMP_C + KELVIN));
}

/** True airspeed in knots for a Mach number at altitude and ISA deviation. */
export function machToTasKt(mach: number, altFt: number, isaDevC: number): number {
  return mach * speedOfSoundKt(altFt, isaDevC);
}

/** True airspeed in knots for a calibrated airspeed (compressible flow). */
export function casToTasKt(casKt: number, altFt: number, isaDevC: number): number {
  const qc = SEA_LEVEL_HPA * (Math.pow(1 + 0.2 * (casKt / A0_KT) ** 2, 3.5) - 1);
  const mach = Math.sqrt(5 * (Math.pow(qc / pressureHpa(altFt) + 1, 2 / 7) - 1));
  return machToTasKt(mach, altFt, isaDevC);
}
