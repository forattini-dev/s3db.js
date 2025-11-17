/**
 * Create Identity context middleware
 * Adds helpers for detecting service accounts vs users
 * @returns {function} Hono middleware
 */
export function createIdentityContextMiddleware() {
  return async (c, next) => {
    // Create identity context object
    const identityContext = {
      /**
       * Check if current request is from a service account
       * @returns {boolean}
       */
      isServiceAccount: () => {
        const user = c.get('user');
        if (!user) return false;

        // Check for service account marker in token
        if (user.token_use === 'service') return true;
        if (user.token_type === 'service') return true; // Legacy support
        if (user.service_account) return true;
        if (typeof user.sub === 'string' && user.sub.startsWith('sa:')) return true;

        return false;
      },

      /**
       * Check if current request is from a human user
       * @returns {boolean}
       */
      isUser: () => {
        const user = c.get('user');
        if (!user) return false;

        // Check for user marker in token
        if (user.token_use === 'user') return true;
        if (user.token_type === 'user') return true; // Legacy support
        if (user.email) return true; // Users have email

        return !identityContext.isServiceAccount();
      },

      /**
       * Get service account metadata (if applicable)
       * @returns {Object|null}
       */
      getServiceAccount: () => {
        const user = c.get('user');
        if (!user || !identityContext.isServiceAccount()) return null;

        return user.service_account || {
          clientId: user.sub?.replace('sa:', '') || user.client_id,
          name: user.name || user.client_id,
          scopes: user.scope ? user.scope.split(' ') : [],
          audiences: Array.isArray(user.aud) ? user.aud : [user.aud]
        };
      },

      /**
       * Get user metadata (if applicable)
       * @returns {Object|null}
       */
      getUser: () => {
        const user = c.get('user');
        if (!user || !identityContext.isUser()) return null;

        return {
          id: user.sub,
          email: user.email,
          tenantId: user.tenantId,
          scopes: user.scope ? user.scope.split(' ') : []
        };
      }
    };

    // Attach to context
    c.set('identity', identityContext);

    // Also set serviceAccount and user for convenience
    if (identityContext.isServiceAccount()) {
      c.set('serviceAccount', identityContext.getServiceAccount());
    } else if (identityContext.isUser()) {
      c.set('userProfile', identityContext.getUser());
    }

    await next();
  };
}
