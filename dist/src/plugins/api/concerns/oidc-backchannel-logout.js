import { jwtVerify } from 'jose';
import { createLogger } from '../../../concerns/logger.js';
const logger = createLogger({ name: 'OidcBackchannel', level: 'info' });
export async function verifyBackchannelLogoutToken(logoutToken, config, signingKey) {
    try {
        const { payload } = await jwtVerify(logoutToken, signingKey, {
            issuer: config.issuer,
            audience: config.clientId,
            clockTolerance: 60
        });
        const validation = validateLogoutTokenClaims(payload);
        if (!validation.valid) {
            throw new Error(`Invalid logout token: ${validation.errors?.join(', ')}`);
        }
        return payload;
    }
    catch (err) {
        throw new Error(`Logout token verification failed: ${err.message}`);
    }
}
export function validateLogoutTokenClaims(claims) {
    const errors = [];
    if (!claims.events) {
        errors.push('Missing "events" claim');
    }
    else {
        const hasBackchannelEvent = claims.events['http://schemas.openid.net/event/backchannel-logout'];
        if (!hasBackchannelEvent) {
            errors.push('Missing backchannel-logout event in "events" claim');
        }
    }
    if (!claims.sub && !claims.sid) {
        errors.push('Must have either "sub" (subject) or "sid" (session ID) claim');
    }
    if (claims.nonce !== undefined) {
        errors.push('Logout token must NOT contain "nonce" claim');
    }
    if (!claims.iss) {
        errors.push('Missing "iss" (issuer) claim');
    }
    if (!claims.aud) {
        errors.push('Missing "aud" (audience) claim');
    }
    if (!claims.iat) {
        errors.push('Missing "iat" (issued at) claim');
    }
    if (!claims.jti) {
        errors.push('Missing "jti" (JWT ID) claim for replay protection');
    }
    return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : null
    };
}
export async function findSessionsToLogout(logoutToken, sessionStore) {
    const sessionsToLogout = [];
    if (typeof sessionStore.findBySub === 'function' && logoutToken.sub) {
        const sessions = await sessionStore.findBySub(logoutToken.sub);
        sessionsToLogout.push(...sessions);
    }
    if (typeof sessionStore.findBySid === 'function' && logoutToken.sid) {
        const sessions = await sessionStore.findBySid(logoutToken.sid);
        sessionsToLogout.push(...sessions);
    }
    return sessionsToLogout;
}
export async function handleBackchannelLogout(context, config, signingKey, sessionStore) {
    try {
        const body = await context.req.parseBody();
        const logoutToken = body.logout_token;
        if (!logoutToken) {
            return {
                success: false,
                error: 'Missing logout_token parameter',
                statusCode: 400
            };
        }
        const claims = await verifyBackchannelLogoutToken(logoutToken, config, signingKey);
        const sessionIds = await findSessionsToLogout(claims, sessionStore);
        let loggedOut = 0;
        for (const sessionId of sessionIds) {
            try {
                await sessionStore.destroy(sessionId);
                loggedOut++;
            }
            catch (err) {
                logger.error({ error: err.message, sessionId }, `[OIDC] Failed to destroy session`);
            }
        }
        if (config.onBackchannelLogout && typeof config.onBackchannelLogout === 'function') {
            try {
                await config.onBackchannelLogout({
                    claims,
                    sessionIds,
                    loggedOut
                });
            }
            catch (err) {
                logger.error({ error: err.message }, '[OIDC] onBackchannelLogout hook failed');
            }
        }
        return {
            success: true,
            sessionsLoggedOut: loggedOut,
            statusCode: 200
        };
    }
    catch (err) {
        logger.error({ error: err.message }, '[OIDC] Backchannel logout error');
        return {
            success: false,
            error: err.message,
            statusCode: 400
        };
    }
}
export function registerBackchannelLogoutRoute(app, path, config, signingKey, sessionStore) {
    if (!sessionStore) {
        throw new Error('Backchannel logout requires a session store');
    }
    app.post(path, async (c) => {
        const result = await handleBackchannelLogout(c, config, signingKey, sessionStore);
        if (result.success) {
            return c.text('', result.statusCode);
        }
        else {
            return c.json({ error: result.error }, result.statusCode);
        }
    });
}
export function providerSupportsBackchannelLogout(discoveryDoc) {
    return discoveryDoc?.backchannel_logout_supported === true;
}
export function getBackchannelLogoutUri(baseUrl, logoutPath = '/auth/backchannel-logout') {
    const url = new URL(logoutPath, baseUrl);
    return url.toString();
}
export function validateBackchannelLogoutConfig(config, discoveryDoc) {
    const errors = [];
    const warnings = [];
    if (!providerSupportsBackchannelLogout(discoveryDoc)) {
        errors.push('Provider does not support backchannel logout (backchannel_logout_supported is false or missing)');
    }
    if (!config.sessionStore) {
        errors.push('Backchannel logout requires sessionStore to be configured');
    }
    if (!config.backchannelLogoutUri) {
        warnings.push('backchannelLogoutUri not configured. You must register this URI with your provider.');
    }
    if (config.sessionStore) {
        const supportsFindBySub = typeof config.sessionStore.findBySub === 'function';
        const supportsFindBySid = typeof config.sessionStore.findBySid === 'function';
        if (!supportsFindBySub && !supportsFindBySid) {
            warnings.push('Session store does not implement findBySub() or findBySid(). ' +
                'You must implement custom logout logic in onBackchannelLogout hook.');
        }
    }
    return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : null,
        warnings: warnings.length > 0 ? warnings : null
    };
}
//# sourceMappingURL=oidc-backchannel-logout.js.map