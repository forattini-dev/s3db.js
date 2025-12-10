export function createContextInjectionMiddleware(database) {
    return async (c, next) => {
        c.set('db', database);
        c.set('database', database);
        for (const [name, resource] of Object.entries(database.resources || {})) {
            c.set(`resource:${name}`, resource);
            const existing = c.get(name);
            if (!existing) {
                c.set(name, resource);
            }
        }
        await next();
    };
}
//# sourceMappingURL=context-injection.js.map