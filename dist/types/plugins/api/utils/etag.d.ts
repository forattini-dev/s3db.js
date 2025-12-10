export interface ETagOptions {
    weak?: boolean;
    lastModified?: Date | string;
}
export interface ParsedETag {
    weak: boolean;
    hash: string;
    timestamp: number | null;
    raw: string;
}
export interface ETagMatchOptions {
    weakComparison?: boolean;
}
export interface S3DBRecord {
    _updatedAt?: string | Date;
    _createdAt?: string | Date;
    [key: string]: unknown;
}
export declare function generateETag(data: unknown, options?: ETagOptions): string;
export declare function parseETag(etagHeader: string | null | undefined): ParsedETag | null;
export declare function etagMatches(etag1: string | null | undefined, etag2: string | null | undefined, options?: ETagMatchOptions): boolean;
export declare function validateIfMatch(ifMatchHeader: string | null | undefined, currentETag: string | null | undefined): boolean;
export declare function validateIfNoneMatch(ifNoneMatchHeader: string | null | undefined, currentETag: string | null | undefined): boolean;
export declare function generateRecordETag(record: S3DBRecord | null | undefined): string | null;
//# sourceMappingURL=etag.d.ts.map