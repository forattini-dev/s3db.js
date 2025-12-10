export function createCorsMiddleware(config = {}) {
    const { origin = '*', methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders = ['Content-Type', 'Authorization', 'X-API-Key'], exposedHeaders = ['X-Total-Count', 'X-Page-Count'], credentials = true, maxAge = 86400 } = config;
    return async (c, next) => {
        c.header('Access-Control-Allow-Origin', origin);
        c.header('Access-Control-Allow-Methods', methods.join(', '));
        c.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
        c.header('Access-Control-Expose-Headers', exposedHeaders.join(', '));
        if (credentials) {
            c.header('Access-Control-Allow-Credentials', 'true');
        }
        c.header('Access-Control-Max-Age', maxAge.toString());
        if (c.req.method === 'OPTIONS') {
            return c.body(null, 204);
        }
        await next();
    };
}
//# sourceMappingURL=cors.js.map