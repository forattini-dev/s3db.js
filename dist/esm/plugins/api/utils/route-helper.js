export function withContext(handler) {
    return async (c) => {
        let database = c.get('db') || c.get('database');
        if (!database) {
            const ctx = c.get('customRouteContext');
            if (ctx && ctx.database) {
                database = ctx.database;
            }
        }
        if (!database) {
            throw new Error('[withContext] Database not found in context. ' +
                'Ensure context injection middleware is registered or customRouteContext is set.');
        }
        const helpers = {
            db: database,
            database: database,
            resources: new Proxy(database.resources || {}, {
                get(target, prop) {
                    if (prop === 'then' || prop === 'catch') {
                        return undefined;
                    }
                    const propStr = String(prop);
                    if (!(propStr in target)) {
                        const available = Object.keys(target).join(', ');
                        throw new Error(`Resource "${propStr}" not found. ` +
                            `Available resources: ${available || '(none)'}`);
                    }
                    return target[propStr];
                }
            })
        };
        return await handler(c, helpers);
    };
}
export function errorResponse(c, message, status = 400) {
    return c.json({
        success: false,
        error: {
            message,
            code: 'ROUTE_ERROR',
            status
        }
    }, status);
}
export function successResponse(c, data, status = 200) {
    return c.json({
        success: true,
        data
    }, status);
}
//# sourceMappingURL=route-helper.js.map