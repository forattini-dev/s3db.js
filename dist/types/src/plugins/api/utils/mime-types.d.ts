export declare function getMimeType(filename: string | null | undefined): string;
export declare function isCompressible(mimeType: string | null | undefined): boolean;
export declare function getCharset(mimeType: string | null | undefined): string | null;
export declare function getContentType(filename: string): string;
declare const _default: {
    getMimeType: typeof getMimeType;
    isCompressible: typeof isCompressible;
    getCharset: typeof getCharset;
    getContentType: typeof getContentType;
};
export default _default;
//# sourceMappingURL=mime-types.d.ts.map