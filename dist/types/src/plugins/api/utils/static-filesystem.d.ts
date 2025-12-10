import type { MiddlewareHandler } from 'hono';
export interface FilesystemHandlerConfig {
    root: string;
    index?: string[];
    fallback?: string | boolean;
    maxAge?: number;
    dotfiles?: 'ignore' | 'allow' | 'deny';
    etag?: boolean;
    cors?: boolean;
}
export declare function createFilesystemHandler(config: FilesystemHandlerConfig): MiddlewareHandler;
export declare function validateFilesystemConfig(config: Partial<FilesystemHandlerConfig>): void;
declare const _default: {
    createFilesystemHandler: typeof createFilesystemHandler;
    validateFilesystemConfig: typeof validateFilesystemConfig;
};
export default _default;
//# sourceMappingURL=static-filesystem.d.ts.map