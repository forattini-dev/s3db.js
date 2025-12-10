import type { Context, MiddlewareHandler } from 'hono';
export interface AuthRule {
    path: string;
    methods: string[];
    required: boolean;
    strategy?: string;
    priorities?: Record<string, number>;
    unauthorizedBehavior?: string | {
        html?: string;
        json?: {
            status?: number;
            error?: string;
            message?: string;
        };
        loginPath?: string;
    };
}
export interface AuthMiddlewareEntry {
    name: string;
    middleware: MiddlewareHandler;
}
export interface PathAuthOptions {
    rules?: AuthRule[];
    authMiddlewares?: Record<string, MiddlewareHandler>;
    unauthorizedHandler?: ((c: Context, message: string) => Response | Promise<Response>) | null;
    events?: {
        emitAuthEvent: (event: string, data: Record<string, unknown>) => void;
    } | null;
}
declare function calculateSpecificity(pattern: string): number;
export declare function matchPath(path: string, pattern: string): boolean;
export declare function findAuthRule(path: string, rules?: AuthRule[]): (AuthRule & {
    specificity: number;
}) | null;
export declare function createPathBasedAuthMiddleware(options?: PathAuthOptions): MiddlewareHandler;
declare const _default: {
    matchPath: typeof matchPath;
    findAuthRule: typeof findAuthRule;
    calculateSpecificity: typeof calculateSpecificity;
    createPathBasedAuthMiddleware: typeof createPathBasedAuthMiddleware;
};
export default _default;
//# sourceMappingURL=path-auth-matcher.d.ts.map