/**
 * Identity Provider Middleware
 * Session validation and authentication middleware
 */
export function sessionAuth(sessionManager, options = {}) {
    const { required = false, requireAdmin = false, redirectTo = '/login' } = options;
    return async (c, next) => {
        const sessionId = sessionManager.getSessionIdFromRequest(c.req);
        let user = null;
        let session = null;
        if (sessionId) {
            const result = await sessionManager.validateSession(sessionId);
            if (result.valid) {
                session = result.session;
                user = result.session?.metadata || null;
            }
            else {
                sessionManager.clearSessionCookie(c);
                if (required) {
                    const currentUrl = c.req.url;
                    return c.redirect(`${redirectTo}?redirect=${encodeURIComponent(currentUrl)}&error=${encodeURIComponent('Your session has expired. Please log in again.')}`);
                }
            }
        }
        if (required && !user) {
            const currentUrl = c.req.url;
            return c.redirect(`${redirectTo}?redirect=${encodeURIComponent(currentUrl)}`);
        }
        if (requireAdmin && (!user || !user.isAdmin)) {
            return c.html('<h1>403 Forbidden</h1><p>You do not have permission to access this page.</p>', 403);
        }
        c.set('user', user);
        c.set('session', session);
        c.set('isAuthenticated', !!user);
        c.set('isAdmin', user?.isAdmin || false);
        await next();
    };
}
export function adminOnly(sessionManager) {
    return sessionAuth(sessionManager, {
        required: true,
        requireAdmin: true
    });
}
export function optionalAuth(sessionManager) {
    return sessionAuth(sessionManager, {
        required: false,
        requireAdmin: false
    });
}
export function csrfProtection(options = {}) {
    const { excludePaths = [] } = options;
    return async (c, next) => {
        const method = c.req.method;
        const path = c.req.path;
        if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            await next();
            return;
        }
        if (excludePaths.some(p => path.startsWith(p))) {
            await next();
            return;
        }
        await next();
    };
}
export default {
    sessionAuth,
    adminOnly,
    optionalAuth,
    csrfProtection
};
//# sourceMappingURL=middleware.js.map