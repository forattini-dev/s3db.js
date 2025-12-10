import { createLogger } from '../../../concerns/logger.js';
const logger = createLogger({ name: 'FailbanMiddleware', level: 'info' });
export function createFailbanMiddleware(config = {}) {
    const { plugin, events = null, handler = null } = config;
    if (!plugin || !plugin.options.enabled) {
        return async (_c, next) => await next();
    }
    return async (c, next) => {
        const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
            c.req.header('x-real-ip') ||
            'unknown';
        if (plugin.isBlacklisted(ip)) {
            c.header('X-Ban-Status', 'blacklisted');
            c.header('X-Ban-Reason', 'IP is permanently blacklisted');
            if (handler) {
                return handler(c, { ip, reason: 'blacklisted', permanent: true });
            }
            return c.json({
                error: 'Forbidden',
                message: 'Your IP address has been permanently blocked',
                ip
            }, 403);
        }
        const countryBlock = plugin.checkCountryBlock(ip);
        if (countryBlock) {
            c.header('X-Ban-Status', 'country_blocked');
            c.header('X-Ban-Reason', countryBlock.reason);
            c.header('X-Country-Code', countryBlock.country);
            if (events) {
                events.emit('security:country_blocked', {
                    ip,
                    country: countryBlock.country,
                    reason: countryBlock.reason,
                    timestamp: new Date().toISOString()
                });
            }
            if (handler) {
                return handler(c, countryBlock);
            }
            return c.json({
                error: 'Forbidden',
                message: 'Access from your country is not allowed',
                country: countryBlock.country,
                ip
            }, 403);
        }
        if (plugin.isBanned(ip)) {
            const ban = await plugin.getBan(ip);
            if (ban) {
                const expiresAt = new Date(ban.expiresAt);
                const retryAfter = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
                c.header('Retry-After', String(retryAfter));
                c.header('X-Ban-Status', 'banned');
                c.header('X-Ban-Reason', ban.reason);
                c.header('X-Ban-Expires', ban.expiresAt);
                if (handler) {
                    return handler(c, { ip, ban, retryAfter });
                }
                return c.json({
                    error: 'Forbidden',
                    message: 'Your IP address has been temporarily banned due to security violations',
                    reason: ban.reason,
                    expiresAt: ban.expiresAt,
                    retryAfter
                }, 403);
            }
        }
        await next();
    };
}
export function setupFailbanViolationListener(config = {}) {
    const { plugin, events } = config;
    if (!plugin || !plugin.options.enabled || !events) {
        return;
    }
    events.on('auth:failure', (data) => {
        const eventData = data;
        const ip = eventData.ip || 'unknown';
        plugin.recordViolation(ip, 'auth_failure', {
            path: eventData.path,
            allowedMethods: eventData.allowedMethods
        });
    });
    events.on('request:error', (data) => {
        const eventData = data;
        const ip = eventData.ip || 'unknown';
        if (eventData.status && eventData.status >= 400 && eventData.status < 500) {
            plugin.recordViolation(ip, 'request_error', {
                path: eventData.path,
                error: eventData.error,
                userAgent: eventData.userAgent
            });
        }
    });
    if (plugin.options.logLevel) {
        logger.info('[Failban] Violation listeners configured');
    }
}
export function createFailbanAdminRoutes(Hono, plugin) {
    const app = new Hono();
    app.get('/bans', async (c) => {
        try {
            const bans = await plugin.listBans();
            return c.json({
                success: true,
                data: bans,
                meta: { count: bans.length }
            });
        }
        catch (err) {
            return c.json({
                success: false,
                error: err.message
            }, 500);
        }
    });
    app.get('/bans/:ip', async (c) => {
        const ip = c.req.param('ip');
        try {
            const ban = await plugin.getBan(ip);
            if (!ban) {
                return c.json({
                    success: false,
                    error: 'Ban not found'
                }, 404);
            }
            return c.json({
                success: true,
                data: ban
            });
        }
        catch (err) {
            return c.json({
                success: false,
                error: err.message
            }, 500);
        }
    });
    app.post('/bans', async (c) => {
        try {
            const body = await c.req.json();
            const { ip, reason, duration } = body;
            if (!ip) {
                return c.json({
                    success: false,
                    error: 'IP address is required'
                }, 400);
            }
            const originalDuration = plugin.options.banDuration;
            if (duration) {
                plugin.options.banDuration = duration;
            }
            await plugin.ban(ip, reason || 'Manual ban by admin');
            if (duration) {
                plugin.options.banDuration = originalDuration;
            }
            return c.json({
                success: true,
                message: `IP ${ip} has been banned`
            });
        }
        catch (err) {
            return c.json({
                success: false,
                error: err.message
            }, 500);
        }
    });
    app.delete('/bans/:ip', async (c) => {
        const ip = c.req.param('ip');
        try {
            const result = await plugin.unban(ip);
            if (!result) {
                return c.json({
                    success: false,
                    error: 'Failed to unban IP'
                }, 500);
            }
            return c.json({
                success: true,
                message: `IP ${ip} has been unbanned`
            });
        }
        catch (err) {
            return c.json({
                success: false,
                error: err.message
            }, 500);
        }
    });
    app.get('/stats', async (c) => {
        try {
            const stats = await plugin.getStats();
            return c.json({
                success: true,
                data: stats
            });
        }
        catch (err) {
            return c.json({
                success: false,
                error: err.message
            }, 500);
        }
    });
    return app;
}
export default {
    createFailbanMiddleware,
    setupFailbanViolationListener,
    createFailbanAdminRoutes
};
//# sourceMappingURL=failban.js.map