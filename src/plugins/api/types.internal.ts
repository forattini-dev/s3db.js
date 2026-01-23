/**
 * Internal Types for API Plugin
 *
 * These types are used internally by the API plugin and should not be
 * exported to users. Users should only interact with ApiPluginOptions.
 */

import type { Context, MiddlewareHandler } from 'hono';

export interface ResourceDescriptor {
  defaultName: string;
  override?: string | null;
}

export interface RegistrationConfig {
  enabled: boolean;
  allowedFields: string[];
  defaultRole: string;
}

export interface LoginThrottleConfig {
  enabled: boolean;
  maxAttempts: number;
  windowMs: number;
  blockDurationMs: number;
  maxEntries: number;
}

export interface DocsConfig {
  enabled: boolean;
  ui: 'swagger' | 'redoc';
  title: string;
  version: string;
  description: string;
  csp: string | null;
}

export interface ApiCorsConfig {
  enabled: boolean;
  origin: string | string[];
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

export interface ApiRateLimitConfig {
  enabled: boolean;
  windowMs: number;
  maxRequests: number;
  keyGenerator: ((c: Context) => string) | null;
  maxUniqueKeys: number;
  rules: unknown[];
}

export interface ApiLoggingConfig {
  enabled: boolean;
  [key: string]: unknown;
}

export interface CompressionConfig {
  enabled: boolean;
  threshold: number;
  level: number;
}

export interface ValidationConfig {
  enabled: boolean;
  validateOnInsert: boolean;
  validateOnUpdate: boolean;
  returnValidationErrors: boolean;
}

export interface CspDirectives {
  'default-src'?: string[];
  'script-src'?: string[];
  'style-src'?: string[];
  'font-src'?: string[];
  'img-src'?: string[];
  'connect-src'?: string[];
  [key: string]: string[] | undefined;
}

export interface ContentSecurityPolicyConfig {
  enabled: boolean;
  directives: CspDirectives;
  reportOnly: boolean;
  reportUri: string | null;
}

export interface FrameguardConfig {
  action: 'deny' | 'sameorigin';
}

export interface HstsConfig {
  maxAge: number;
  includeSubDomains: boolean;
  preload: boolean;
}

export interface ReferrerPolicyConfig {
  policy: string;
}

export interface DnsPrefetchControlConfig {
  allow: boolean;
}

export interface PermittedCrossDomainPoliciesConfig {
  policy: string;
}

export interface XssFilterConfig {
  mode: string;
}

export interface PermissionsPolicyFeatures {
  geolocation?: string[];
  microphone?: string[];
  camera?: string[];
  payment?: string[];
  usb?: string[];
  magnetometer?: string[];
  gyroscope?: string[];
  accelerometer?: string[];
  [key: string]: string[] | undefined;
}

export interface PermissionsPolicyConfig {
  features: PermissionsPolicyFeatures;
}

export interface ApiSecurityConfig {
  enabled: boolean;
  contentSecurityPolicy: ContentSecurityPolicyConfig | false;
  frameguard: FrameguardConfig | false;
  noSniff: boolean;
  hsts: HstsConfig | false;
  referrerPolicy: ReferrerPolicyConfig | false;
  dnsPrefetchControl: DnsPrefetchControlConfig | false;
  ieNoOpen: boolean;
  permittedCrossDomainPolicies: PermittedCrossDomainPoliciesConfig | false;
  xssFilter: XssFilterConfig | false;
  permissionsPolicy: PermissionsPolicyConfig | false;
}

export interface TemplatesConfig {
  enabled: boolean;
  engine: 'jsx' | 'ejs' | 'custom';
  templatesDir: string;
  layout: string | null;
  engineOptions: Record<string, unknown>;
  customRenderer: ((template: string, data: unknown) => string) | null;
}

export interface FailbanConfig {
  enabled: boolean;
  resourceNames?: Record<string, string>;
  [key: string]: unknown;
}

export interface HealthConfig {
  enabled: boolean;
  [key: string]: unknown;
}

export interface StaticConfig {
  path: string;
  root: string;
  [key: string]: unknown;
}

export interface AuthDriverDefinition {
  driver: string;
  config?: {
    resource?: string;
    [key: string]: unknown;
  };
}

export interface AuthConfig {
  drivers: AuthDriverDefinition[];
  registration: RegistrationConfig;
  loginThrottle: LoginThrottleConfig;
  createResource: boolean;
  usersResourcePasswordValidation: string;
  enableIdentityContextMiddleware: boolean;
  usersResourceAttributes: Record<string, string>;
  resource?: string;
  [key: string]: unknown;
}

export interface ApiPluginConfig {
  port: number;
  host: string;
  logLevel: string | false;
  basePath: string;
  startupBanner: boolean;
  versionPrefix: boolean | string;
  docs: DocsConfig;
  auth: AuthConfig;
  routes: Record<string, unknown>;
  templates: TemplatesConfig;
  cors: ApiCorsConfig;
  rateLimit: ApiRateLimitConfig;
  logging: ApiLoggingConfig;
  compression: CompressionConfig;
  validation: ValidationConfig;
  security: ApiSecurityConfig;
  middlewares: MiddlewareHandler[];
  requestId: { enabled: boolean };
  sessionTracking: { enabled: boolean };
  events: { enabled: boolean };
  metrics: { enabled: boolean };
  failban: FailbanConfig;
  static: StaticConfig[];
  health: HealthConfig;
  maxBodySize: number;
  resources: Record<string, unknown>;
}

export interface UninstallOptions {
  purgeData?: boolean;
}

export interface DatabaseLike {
  resources?: Record<string, ResourceLike>;
  createResource(options: CreateResourceOptions): Promise<ResourceLike>;
  deleteResource(name: string): Promise<void>;
}

export interface ResourceLike {
  name: string;
  [key: string]: unknown;
}

export interface CreateResourceOptions {
  name: string;
  attributes: Record<string, string>;
  behavior: string;
  timestamps: boolean;
  createdBy: string;
}
