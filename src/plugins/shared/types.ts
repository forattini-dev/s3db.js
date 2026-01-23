/**
 * Shared Types for Plugins
 *
 * This module contains types that are shared across multiple plugins.
 * These are the canonical definitions to avoid duplicate exports.
 */

// Re-export from middlewares (canonical source)
export type {
  CorsConfig,
} from './middlewares/cors.js';

export type {
  SecurityConfig,
  CSPDirectives,
  ContentSecurityPolicyConfig,
  FrameguardConfig,
  HstsConfig,
  ReferrerPolicyConfig,
  DnsPrefetchControlConfig,
  PermittedCrossDomainPoliciesConfig,
  XssFilterConfig,
  PermissionsPolicyConfig,
} from './middlewares/security.js';

export type {
  LoggingConfig,
  LoggingContext,
} from './middlewares/logging.js';

/**
 * Server information returned by getServerInfo() methods
 * Used by ApiPlugin and IdentityPlugin
 */
export interface ServerInfo {
  isRunning: boolean;
  port?: number;
  host?: string;
  resources?: number;
}

/**
 * Base rate limit configuration shared across plugins
 */
export interface BaseRateLimitConfig {
  enabled?: boolean;
  windowMs?: number;
  maxRequests?: number;
}
