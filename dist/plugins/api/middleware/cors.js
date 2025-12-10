export async function createCorsMiddleware(corsConfig) {
    return async (c, next) => {
        const { origin, methods, allowedHeaders, exposedHeaders, credentials, maxAge } = corsConfig;
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