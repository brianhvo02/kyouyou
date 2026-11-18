import { describe, expect, it } from 'vitest';
import { casToTasKt, flToHpaLevel, isaTempC, machToTasKt, pressureHpa } from './atmosphere.ts';

describe('ISA atmosphere', () => {
  it('computes ISA temperature', () => {
    expect(isaTempC(0)).toBe(15);
    expect(isaTempC(36089)).toBeCloseTo(-56.5, 1);
    expect(isaTempC(40000)).toBe(-56.5);
  });

  it('computes ISA pressure', () => {
    expect(pressureHpa(0)).toBeCloseTo(1013.25, 2);
    expect(Math.abs(pressureHpa(34000) - 250)).toBeLessThan(3);
    expect(pressureHpa(36089)).toBeCloseTo(226.3, 0);
  });

  it('picks the nearest GFS level', () => {
    expect(flToHpaLevel(350)).toBe(250);
    expect(flToHpaLevel(370)).toBe(200);
    expect(flToHpaLevel(250)).toBe(400);
    expect(flToHpaLevel(0)).toBe(1000);
    expect(flToHpaLevel(600)).toBe(100);
  });

  it('uses the intermediate levels Open-Meteo serves (350 to 750 hPa)', () => {
    expect(flToHpaLevel(270)).toBe(350); // ISA 344 hPa
    expect(flToHpaLevel(200)).toBe(450); // ISA 466 hPa
    expect(flToHpaLevel(160)).toBe(550); // ISA 543 hPa
    expect(flToHpaLevel(120)).toBe(650); // ISA 644 hPa
    expect(flToHpaLevel(80)).toBe(750); // ISA 753 hPa
  });

  it('converts Mach to TAS', () => {
    expect(Math.abs(machToTasKt(0.78, 35000, 0) - 450)).toBeLessThan(3);
    expect(machToTasKt(0.78, 35000, 10)).toBeGreaterThan(machToTasKt(0.78, 35000, 0));
  });

  it('converts CAS to TAS', () => {
    expect(casToTasKt(250, 0, 0)).toBeCloseTo(250, 0);
    expect(casToTasKt(280, 35000, 0)).toBeGreaterThan(450);
    expect(casToTasKt(280, 35000, 0)).toBeLessThan(500);
  });
});
