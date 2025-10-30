/**
 * Failban Middleware
 *
 * Checks if IP is banned or blocked by country restrictions before processing request.
 * Integrates with FailbanManager for automatic banning and GeoIP filtering.
 *
 * @example
 * import { createFailbanMiddleware } from './middlewares/failban.js';
 *
 * const middleware = createFailbanMiddleware({
 *   plugin: failbanManager,
 *   events: eventEmitter
 * });
 *
 * app.use('*', middleware);
 */

/**
 * Create failban middleware
 *
 * @param {Object} config - Middleware configuration
 * @param {FailbanManager} config.plugin - FailbanManager instance
 * @param {ApiEventEmitter} config.events - Event emitter for violations
 * @param {Function} config.handler - Custom handler for banned IPs
 * @returns {Function} Hono middleware
 */
export function createFailbanMiddleware(config = {}) {
  const {
    plugin,
    events = null,
    handler = null
  } = config;

  if (!plugin || !plugin.options.enabled) {
    // Return no-op middleware if plugin disabled
    return async (c, next) => await next();
  }

  return async (c, next) => {
    // Extract IP
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
               c.req.header('x-real-ip') ||
               'unknown';

    // Check if blacklisted
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

    // Check country restrictions (GeoIP)
    const countryBlock = plugin.checkCountryBlock(ip);
    if (countryBlock) {
      c.header('X-Ban-Status', 'country_blocked');
      c.header('X-Ban-Reason', countryBlock.reason);
      c.header('X-Country-Code', countryBlock.country);

      // Emit country block event
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

    // Check if banned
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

    // Not banned - continue
    await next();
  };
}

/**
 * Create violation recorder middleware
 * Listens to rate limit events and records violations
 *
 * @param {Object} config - Configuration
 * @param {FailbanManager} config.plugin - FailbanManager instance
 * @param {ApiEventEmitter} config.events - Event emitter
 * @returns {void}
 */
export function setupFailbanViolationListener(config = {}) {
  const { plugin, events } = config;

  if (!plugin || !plugin.options.enabled || !events) {
    return;
  }

  // Listen to auth failures
  events.on('auth:failure', (data) => {
    const ip = data.ip || 'unknown';
    plugin.recordViolation(ip, 'auth_failure', {
      path: data.path,
      allowedMethods: data.allowedMethods
    });
  });

  // Listen to request errors (could indicate attacks)
  events.on('request:error', (data) => {
    const ip = data.ip || 'unknown';

    // Only record if it's a 4xx error (client error)
    if (data.status && data.status >= 400 && data.status < 500) {
      plugin.recordViolation(ip, 'request_error', {
        path: data.path,
        error: data.error,
        userAgent: data.userAgent
      });
    }
  });

  if (plugin.options.verbose) {
    console.log('[Failban] Violation listeners configured');
  }
}

/**
 * Create admin routes for ban management
 *
 * @param {Object} Hono - Hono constructor
 * @param {FailbanManager} plugin - FailbanManager instance
 * @returns {Hono} Hono app with admin routes
 */
export function createFailbanAdminRoutes(Hono, plugin) {
  const app = new Hono();

  // List all active bans
  app.get('/bans', async (c) => {
    try {
      const bans = await plugin.listBans();
      return c.json({
        success: true,
        data: bans,
        meta: { count: bans.length }
      });
    } catch (err) {
      return c.json({
        success: false,
        error: err.message
      }, 500);
    }
  });

  // Get specific ban
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
    } catch (err) {
      return c.json({
        success: false,
        error: err.message
      }, 500);
    }
  });

  // Manually ban an IP
  app.post('/bans', async (c) => {
    try {
      const { ip, reason, duration } = await c.req.json();

      if (!ip) {
        return c.json({
          success: false,
          error: 'IP address is required'
        }, 400);
      }

      // Override ban duration if provided
      const originalDuration = plugin.options.banDuration;
      if (duration) {
        plugin.options.banDuration = duration;
      }

      await plugin.ban(ip, reason || 'Manual ban by admin');

      // Restore original duration
      if (duration) {
        plugin.options.banDuration = originalDuration;
      }

      return c.json({
        success: true,
        message: `IP ${ip} has been banned`
      });
    } catch (err) {
      return c.json({
        success: false,
        error: err.message
      }, 500);
    }
  });

  // Unban an IP
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
    } catch (err) {
      return c.json({
        success: false,
        error: err.message
      }, 500);
    }
  });

  // Get statistics
  app.get('/stats', async (c) => {
    try {
      const stats = await plugin.getStats();
      return c.json({
        success: true,
        data: stats
      });
    } catch (err) {
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
