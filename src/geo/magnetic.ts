// True and magnetic directions, given the magnetic variation where they are read. Variation is
// positive east, negative west ("east is least"): magnetic = true - variation.

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
