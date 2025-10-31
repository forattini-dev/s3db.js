/**
 * Custom errors for PuppeteerPlugin
 */

export class PuppeteerError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'PuppeteerError';
    this.code = code;
    this.details = details;
  }
}

export class BrowserPoolError extends PuppeteerError {
  constructor(message, details = {}) {
    super(message, 'BROWSER_POOL_ERROR', details);
    this.name = 'BrowserPoolError';
  }
}

export class CookieManagerError extends PuppeteerError {
  constructor(message, details = {}) {
    super(message, 'COOKIE_MANAGER_ERROR', details);
    this.name = 'CookieManagerError';
  }
}

export class NavigationError extends PuppeteerError {
  constructor(message, details = {}) {
    super(message, 'NAVIGATION_ERROR', details);
    this.name = 'NavigationError';
  }
}

export class HumanBehaviorError extends PuppeteerError {
  constructor(message, details = {}) {
    super(message, 'HUMAN_BEHAVIOR_ERROR', details);
    this.name = 'HumanBehaviorError';
  }
}

export class SessionError extends PuppeteerError {
  constructor(message, details = {}) {
    super(message, 'SESSION_ERROR', details);
    this.name = 'SessionError';
  }
}
