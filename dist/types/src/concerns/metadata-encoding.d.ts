export type EncodingType = 'none' | 'special' | 'ascii' | 'url' | 'base64' | 'dictionary';
export interface AnalysisStats {
    ascii: number;
    latin1: number;
    multibyte: number;
}
export interface AnalysisResult {
    type: EncodingType;
    safe: boolean;
    reason?: string;
    stats?: AnalysisStats;
}
export interface EncodeResult {
    encoded: string;
    encoding: EncodingType;
    analysis?: AnalysisResult;
    dictionaryType?: 'exact' | 'prefix';
    savings?: number;
    compressionRatio?: string;
    reason?: string;
}
export interface EncodedSizeInfo {
    original: number;
    encoded: number;
    overhead: number;
    ratio: number;
    encoding: EncodingType;
}
export declare function analyzeString(str: string): AnalysisResult;
export declare function metadataEncode(value: unknown): EncodeResult;
export declare function metadataDecode(value: unknown): unknown;
export declare function calculateEncodedSize(value: string): EncodedSizeInfo;
//# sourceMappingURL=metadata-encoding.d.ts.map