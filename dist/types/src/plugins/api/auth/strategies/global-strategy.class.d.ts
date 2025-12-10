import type { MiddlewareHandler } from 'hono';
import { BaseAuthStrategy } from './base-strategy.class.js';
export declare class GlobalAuthStrategy extends BaseAuthStrategy {
    createMiddleware(): Promise<MiddlewareHandler>;
}
//# sourceMappingURL=global-strategy.class.d.ts.map