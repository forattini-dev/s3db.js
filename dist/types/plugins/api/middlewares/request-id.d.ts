import type { MiddlewareHandler } from 'hono';
export type IdGeneratorFn = () => string;
export interface RequestIdConfig {
    headerName?: string;
    generator?: IdGeneratorFn;
    includeInResponse?: boolean;
    includeInLogs?: boolean;
}
export declare function createRequestIdMiddleware(config?: RequestIdConfig): MiddlewareHandler;
export default createRequestIdMiddleware;
//# sourceMappingURL=request-id.d.ts.map