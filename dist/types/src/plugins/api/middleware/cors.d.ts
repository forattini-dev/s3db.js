import type { Context, Next } from 'hono';
export interface CorsConfig {
    origin: string;
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    credentials: boolean;
    maxAge: number;
}
export declare function createCorsMiddleware(corsConfig: CorsConfig): Promise<(c: Context, next: Next) => Promise<Response | void>>;
//# sourceMappingURL=cors.d.ts.map