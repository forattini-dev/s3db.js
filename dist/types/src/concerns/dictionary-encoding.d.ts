export interface DictionaryEncodeResult {
    encoded: string;
    encoding: 'dictionary';
    originalLength: number;
    encodedLength: number;
    dictionaryType: 'exact' | 'prefix';
    savings: number;
    prefix?: string;
    remainder?: string;
}
export interface DictionaryCompressionStats {
    compressible: boolean;
    original: number;
    encoded: number;
    savings: number;
    ratio: number;
    savingsPercent?: string;
}
export interface DictionaryStats {
    contentTypes: number;
    urlPrefixes: number;
    statusMessages: number;
    total: number;
    avgSavingsContentType: number;
    avgSavingsStatus: number;
}
export declare const CONTENT_TYPE_DICT: Record<string, string>;
export declare const URL_PREFIX_DICT: Record<string, string>;
export declare const STATUS_MESSAGE_DICT: Record<string, string>;
export declare function dictionaryEncode(value: string): DictionaryEncodeResult | null;
export declare function dictionaryDecode(encoded: string): string | null;
export declare function calculateDictionaryCompression(value: string): DictionaryCompressionStats;
export declare function getDictionaryStats(): DictionaryStats;
declare const _default: {
    dictionaryEncode: typeof dictionaryEncode;
    dictionaryDecode: typeof dictionaryDecode;
    calculateDictionaryCompression: typeof calculateDictionaryCompression;
    getDictionaryStats: typeof getDictionaryStats;
    CONTENT_TYPE_DICT: Record<string, string>;
    URL_PREFIX_DICT: Record<string, string>;
    STATUS_MESSAGE_DICT: Record<string, string>;
};
export default _default;
//# sourceMappingURL=dictionary-encoding.d.ts.map