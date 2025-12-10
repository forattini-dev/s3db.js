import { getCookie, setCookie } from 'hono/cookie';
const safeGetCookie = (context, name) => {
    const req = context?.req;
    if (req?.cookie) {
        try {
            return req.cookie(name) || null;
        }
        catch {
            // Fall through to hono helper
        }
    }
    try {
        return getCookie(context, name) || null;
    }
    catch {
        return null;
    }
};
const safeSetCookie = (context, name, value, options) => {
    try {
        setCookie(context, name, value, options);
    }
    catch {
        // Tests may provide minimal mocks without response helpers.
    }
};
const SILENT_LOGIN_COOKIE = '_silent_login_attempted';
const SILENT_LOGIN_TTL = 3600000; // 1 hour
export function shouldAttemptSilentLogin(context, options = {}) {
    const { enableSilentLogin = false, silentLoginPaths = [], excludePaths = [] } = options;
    if (!enableSilentLogin) {
        return false;
    }
    if (context.get('user') || context.get('session')) {
        return false;
    }
    const attemptedCookie = safeGetCookie(context, SILENT_LOGIN_COOKIE);
    if (attemptedCookie) {
        return false;
    }
    const acceptsHtml = context.req.header('accept')?.includes('text/html');
    if (!acceptsHtml) {
        return false;
    }
    const path = context.req.path;
    if (excludePaths.length > 0) {
        if (excludePaths.some(p => path === p || path.startsWith(p + '/'))) {
            return false;
        }
    }
    if (silentLoginPaths.length > 0) {
        return silentLoginPaths.some(p => path === p || path.startsWith(p + '/'));
    }
    return true;
}
export function markSilentLoginAttempted(context, options = {}) {
    const { secure = true, sameSite = 'Lax', domain = null, path = '/' } = options;
    safeSetCookie(context, SILENT_LOGIN_COOKIE, '1', {
        httpOnly: true,
        secure,
        sameSite,
        ...(domain ? { domain } : {}),
        path,
        maxAge: SILENT_LOGIN_TTL / 1000
    });
}
export function clearSilentLoginAttempt(context, options = {}) {
    const { secure = true, sameSite = 'Lax', domain = null, path = '/' } = options;
    safeSetCookie(context, SILENT_LOGIN_COOKIE, '', {
        httpOnly: true,
        secure,
        sameSite,
        ...(domain ? { domain } : {}),
        path,
        maxAge: 0
    });
}
export function handleSilentLoginError(error) {
    const silentLoginErrors = [
        'login_required',
        'consent_required',
        'interaction_required',
        'account_selection_required'
    ];
    const errorCode = error.error || error.code || '';
    if (silentLoginErrors.includes(errorCode)) {
        return {
            shouldRedirectToLogin: true,
            reason: errorCode,
            message: 'Silent login failed, redirecting to interactive login'
        };
    }
    return {
        shouldRedirectToLogin: false,
        reason: errorCode,
        message: error.error_description || 'Authentication error'
    };
}
export function buildSilentLoginUrl(baseAuthUrl, params) {
    const url = new URL(baseAuthUrl);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, value);
        }
    });
    url.searchParams.set('prompt', 'none');
    return url.toString();
}
//# sourceMappingURL=oidc-silent-login.js.map