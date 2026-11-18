// True and magnetic directions, given the magnetic variation where they are read. Variation is
// positive east, negative west ("east is least"): magnetic = true - variation.
function to360(deg) {
    return ((deg % 360) + 360) % 360;
}
/** A true direction as magnetic, 0 up to 360. */
export function trueToMagnetic(trueDeg, variationDeg) {
    return to360(trueDeg - variationDeg);
}
/** A magnetic direction as true, 0 up to 360. */
export function magneticToTrue(magneticDeg, variationDeg) {
    return to360(magneticDeg + variationDeg);
}
