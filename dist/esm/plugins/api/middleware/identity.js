export function createIdentityContextMiddleware() {
    return async (c, next) => {
        const identityContext = {
            isServiceAccount: () => {
                const user = c.get('user');
                if (!user)
                    return false;
                if (user.token_use === 'service')
                    return true;
                if (user.token_type === 'service')
                    return true;
                if (user.service_account)
                    return true;
                if (typeof user.sub === 'string' && user.sub.startsWith('sa:'))
                    return true;
                return false;
            },
            isUser: () => {
                const user = c.get('user');
                if (!user)
                    return false;
                if (user.token_use === 'user')
                    return true;
                if (user.token_type === 'user')
                    return true;
                if (user.email)
                    return true;
                return !identityContext.isServiceAccount();
            },
            getServiceAccount: () => {
                const user = c.get('user');
                if (!user || !identityContext.isServiceAccount())
                    return null;
                return user.service_account || {
                    clientId: user.sub?.replace('sa:', '') || user.client_id,
                    name: user.name || user.client_id,
                    scopes: user.scope ? user.scope.split(' ') : [],
                    audiences: Array.isArray(user.aud) ? user.aud : [user.aud]
                };
            },
            getUser: () => {
                const user = c.get('user');
                if (!user || !identityContext.isUser())
                    return null;
                return {
                    id: user.sub,
                    email: user.email,
                    tenantId: user.tenantId,
                    scopes: user.scope ? user.scope.split(' ') : []
                };
            }
        };
        c.set('identity', identityContext);
        if (identityContext.isServiceAccount()) {
            c.set('serviceAccount', identityContext.getServiceAccount());
        }
        else if (identityContext.isUser()) {
            c.set('userProfile', identityContext.getUser());
        }
        await next();
    };
}
//# sourceMappingURL=identity.js.map