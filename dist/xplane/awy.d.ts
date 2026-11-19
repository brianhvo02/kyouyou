export interface AirwayPoint {
    ident: string;
    region: string;
}
export interface AirwaySegment {
    from: AirwayPoint & {
        type: number;
    };
    to: AirwayPoint & {
        type: number;
    };
    direction: 'N' | 'F' | 'B';
    high: boolean;
    baseFl: number;
    topFl: number;
    names: string[];
}
export type SegmentDirection = 'both' | 'forward' | 'backward';
export interface AirwayRun {
    airway: string;
    high: boolean;
    /** In sequence along the run. */
    points: AirwayPoint[];
    /** One per segment, relative to the points' order; absent when every segment is two-way. */
    directions?: SegmentDirection[];
}
export declare function parseAwySegments(text: string): AirwaySegment[];
export declare function airwayRuns(segments: readonly AirwaySegment[]): AirwayRun[];
