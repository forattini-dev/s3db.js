export interface GeoPoint {
    latitude: number;
    longitude: number;
}
export declare function encodeGeoLat(lat: number | null | undefined, precision?: number): string | number | null | undefined;
export declare function decodeGeoLat(encoded: string | number, precision?: number): number | string;
export declare function encodeGeoLon(lon: number | null | undefined, precision?: number): string | number | null | undefined;
export declare function decodeGeoLon(encoded: string | number, precision?: number): number | string;
export declare function encodeGeoPoint(lat: number, lon: number, precision?: number): string;
export declare function decodeGeoPoint(encoded: string, precision?: number): GeoPoint;
export declare function isValidCoordinate(lat: number, lon: number): boolean;
export declare function getPrecisionForAccuracy(accuracyMeters: number): number;
export declare function getAccuracyForPrecision(precision: number): number;
//# sourceMappingURL=geo-encoding.d.ts.map