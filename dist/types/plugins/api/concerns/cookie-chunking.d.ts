import type { Context } from 'hono';
export interface CookieChunkOverflowDetails {
    cookieName: string;
    chunkCount: number;
    chunkLimit: number;
    payloadBytes: number;
}
export declare class CookieChunkOverflowError extends Error {
    name: string;
    code: string;
    details: CookieChunkOverflowDetails;
    constructor(details: CookieChunkOverflowDetails);
}
export interface CookieOptions {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    maxAge?: number;
    domain?: string;
    path?: string;
    expires?: Date;
}
export interface ChunkingOptions {
    onOverflow?: (details: CookieChunkOverflowDetails & {
        value: string;
    }) => boolean | void;
}
type CookieJar = Record<string, string>;
export declare function setChunkedCookie(context: Context, name: string, value: string | null | undefined, options?: CookieOptions, chunkingOptions?: ChunkingOptions): void;
export declare function getChunkedCookie(context: Context, name: string, cookieJarOverride?: CookieJar | null): string | null;
export declare function deleteChunkedCookie(context: Context, name: string, options?: CookieOptions, cookieJar?: CookieJar | null): void;
export declare function isChunkedCookie(context: Context, name: string): boolean;
export {};
//# sourceMappingURL=cookie-chunking.d.ts.map