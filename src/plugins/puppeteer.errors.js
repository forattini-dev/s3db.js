import { PluginError } from '../errors.js';

/**
 * Custom errors for PuppeteerPlugin with actionable messaging.
 */

export class PuppeteerError extends PluginError {
  constructor(message, details = {}) {
    const merged = {
      pluginName: details.pluginName || 'PuppeteerPlugin',
      operation: details.operation || 'unknown',
      statusCode: details.statusCode ?? 500,
      retriable: details.retriable ?? false,
      suggestion: details.suggestion ?? 'Review PuppeteerPlugin configuration (proxies, sessions, scripts) and retry.',
      ...details
    };
    super(message, merged);
    this.name = 'PuppeteerError';
  }
}

export class BrowserPoolError extends PuppeteerError {
  constructor(message, details = {}) {
    super(message, {
      code: 'BROWSER_POOL_ERROR',
      retriable: details.retriable ?? true,
      suggestion: details.suggestion ?? 'Verify browser instances are healthy and increase pool size or restart browsers.',
      docs: details.docs || 'https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/puppeteer.md#browser-pool',
      ...details
    });
    this.name = 'BrowserPoolError';
  }
}

export class CookieManagerError extends PuppeteerError {
  constructor(message, details = {}) {
    super(message, {
      code: 'COOKIE_MANAGER_ERROR',
      retriable: details.retriable ?? false,
      suggestion: details.suggestion ?? 'Check cookie storage configuration and ensure persona sessions are valid.',
      ...details
    });
    this.name = 'CookieManagerError';
  }
}

export class NavigationError extends PuppeteerError {
  constructor(message, details = {}) {
    super(message, {
      code: 'NAVIGATION_ERROR',
      retriable: details.retriable ?? true,
      suggestion: details.suggestion ?? 'Validate target URLs, network access, and waitFor options before retrying.',
      ...details
    });
    this.name = 'NavigationError';
  }
}

export class HumanBehaviorError extends PuppeteerError {
  constructor(message, details = {}) {
    super(message, {
      code: 'HUMAN_BEHAVIOR_ERROR',
      retriable: details.retriable ?? false,
      suggestion: details.suggestion ?? 'Adjust human behavior thresholds or provide alternate interaction scripts.',
      ...details
    });
    this.name = 'HumanBehaviorError';
  }
}

export class SessionError extends PuppeteerError {
  constructor(message, details = {}) {
    super(message, {
      code: 'SESSION_ERROR',
      retriable: details.retriable ?? true,
      suggestion: details.suggestion ?? 'Refresh or recreate the browser session and ensure session storage is writable.',
      ...details
    });
    this.name = 'SessionError';
  }
}
