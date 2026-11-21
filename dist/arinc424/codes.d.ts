/**
 * An altitude limit in words, from the altitude description and the two altitude fields of a leg:
 * `('+', '5000', '')` is "at or above 5,000 ft", `('B', 'FL120', '8000')` "between FL120 and 8,000 ft".
 * Empty when no altitude is given. An unknown descriptor keeps its code.
 */
export declare function describeAltitude(descriptor: string, alt1: string, alt2: string): string;
/** A path terminator (leg type) in words: `TF` is "track to fix". Null for an unknown code. */
export declare function pathTerminatorName(code: string): string | null;
/**
 * A route type in words, for SIDs, STARs and approaches (airport or heliport) and airways:
 * `('P', 'F', 'I')` is "ILS approach". Null for an unknown code or a kind without route types.
 */
export declare function routeTypeName(section: string, subsection: string, code: string): string | null;
/** A turn direction in words: L "left", R "right", E "either". Null for anything else. */
export declare function turnDirectionName(code: string): string | null;
/**
 * A speed limit in words: `('-', '230')` is "at or below 230 kt". Empty without a speed. An unknown
 * descriptor keeps its code.
 */
export declare function speedLimitDescription(descriptor: string, speed: string): string;
