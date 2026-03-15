/**
 * Internal Types for API Plugin
 *
 * These types are used internally by the API plugin and should not be
 * exported to users. Users should only interact with ApiPluginOptions.
 */

import type { Context, MiddlewareHandler } from '#src/plugins/shared/http-runtime.js';

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
  title: string;
  version: string;
  description: string;
  uiTheme: 'light' | 'dark' | 'auto';
  tryItOut: boolean;
  codeGeneration: boolean;
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
  config?: {
    index?: string[];
    fallback?: string | boolean;
    fallbackIgnore?: string[];
    maxAge?: number;
    dotfiles?: 'ignore' | 'allow' | 'deny';
    etag?: boolean;
    cors?: boolean;
    streaming?: boolean;
    signedUrlExpiry?: number;
    cacheControl?: string;
    contentDisposition?: string;
  };
  [key: string]: unknown;
}

export interface AuthDriverDefinition {
  driver: string;
  config?: {
    resource?: string;
    [key: string]: unknown;
  };
}

export interface AuthPathRule {
  path?: string;
  required?: boolean;
  methods?: string[];
  roles?: string | string[];
  scopes?: string | string[];
  allowServiceAccounts?: boolean;
}

export interface AuthConfig {
  drivers: AuthDriverDefinition[];
  pathRules: AuthPathRule[];
  strategy: string;
  priorities: Record<string, number>;
  registration: RegistrationConfig;
  loginThrottle: LoginThrottleConfig;
  createResource: boolean;
  driver: string | null;
  usersResourcePasswordValidation: string;
  enableIdentityContextMiddleware: boolean;
  usersResourceAttributes: Record<string, string>;
  usernameField?: string;
  passwordField?: string;
  resource?: string | null;
  skipRoutes?: boolean;
  [key: string]: unknown;
}

export interface ApiListenerConfigInputProtocol {
  enabled?: boolean;
  path?: string;
  maxPayloadBytes?: number;
  maxMessageBytes?: number;
  [key: string]: unknown;
}

export interface ApiListenerConfigInput {
  name?: string;
  bind?: {
    host?: string;
    port?: number;
  };
  protocols?: {
    [protocol: string]: ApiListenerConfigInputProtocol | boolean | undefined;
    http?: ApiListenerConfigInputProtocol | undefined;
    websocket?: ApiListenerConfigInputProtocol | undefined;
    tcp?: ApiListenerConfigInputProtocol | undefined;
    udp?: ApiListenerConfigInputProtocol | undefined;
  };
  http?: ApiListenerConfigInputProtocol | undefined;
  websocket?: ApiListenerConfigInputProtocol | undefined;
  tcp?: ApiListenerConfigInputProtocol | undefined;
  udp?: ApiListenerConfigInputProtocol | undefined;
}

export interface ApiListenerHttpConfig {
  enabled: boolean;
  path: string;
}

export interface ApiListenerWebSocketChannelsConfig {
  authorize?: (socketId: string, channel: string, ctx: unknown) => boolean | Promise<boolean>;
  presenceData?: (socketId: string, channel: string, ctx: unknown) => Record<string, unknown>;
  hooks?: Record<string, (...args: unknown[]) => void | Promise<void>>;
  rateLimits?: Record<string, unknown>;
  history?: { enabled?: boolean; maxSize?: number; ttl?: number };
  transform?: (channel: string, event: string, data: unknown, ctx: unknown) => unknown | null;
  maxSubscribersPerChannel?: number | ((channel: string) => number);
  typing?: { enabled?: boolean; timeout?: number };
  restApi?: { enabled?: boolean; path?: string; apiKey?: string; auth?: unknown };
  publishAuth?: (socketId: string, channel: string, event: string, data: unknown, ctx: unknown) => boolean | Promise<boolean>;
}

export interface ApiListenerWebSocketAuthConfig {
  mode: 'ticket' | 'bearer' | 'custom';
  ticketStore?: unknown;
  ticketTTL?: number;
  extractToken?: (req: unknown) => string | undefined;
  validateToken?: (token: string) => unknown | null | Promise<unknown | null>;
  refreshToken?: (token: string) => unknown | null | Promise<unknown | null>;
}

export interface ApiListenerWebSocketConfig {
  enabled: boolean;
  path: string;
  maxPayloadBytes: number;
  channels?: ApiListenerWebSocketChannelsConfig;
  auth?: ApiListenerWebSocketAuthConfig;
  heartbeatInterval?: number;
  compression?: boolean | { threshold?: number; level?: number };
  backpressure?: { maxBufferedAmount?: number; strategy?: 'drop' | 'disconnect' };
  recovery?: { enabled?: boolean; ttl?: number };
}

export interface ApiListenerTcpConfig {
  enabled: boolean;
  onConnection?: (socket: unknown) => void;
  onData?: (socket: unknown, data: Buffer) => void;
  onClose?: (socket: unknown, hadError: boolean) => void;
  onError?: (error: Error) => void;
}

export interface ApiWebSocketHookContext {
  database: unknown;
  adapter: unknown;
  logger: unknown;
}

export type ApiListenerWebSocketProtocolHandlers = {
  onConnection?: (socketId: string, send: (message: unknown) => void, req: unknown, ctx: ApiWebSocketHookContext) => void;
  onMessage?: (socketId: string, raw: string | Buffer, send: (message: unknown) => void, ctx: ApiWebSocketHookContext) => boolean | Promise<boolean>;
  onClose?: (socketId: string, code: number, reason: string, ctx: ApiWebSocketHookContext) => void;
};

export interface ApiListenerUdpConfig {
  enabled: boolean;
  maxMessageBytes: number;

  onMessage?: (message: Buffer, remoteInfo: { address: string; port: number; family: string; size: number }) => void;
  onError?: (error: Error) => void;
}

export interface ApiListenerProtocolConfig {
  http: ApiListenerHttpConfig;
  websocket: ApiListenerWebSocketConfig & ApiListenerWebSocketProtocolHandlers;
  tcp: ApiListenerTcpConfig;
  udp: ApiListenerUdpConfig;
  custom: Record<string, ApiListenerConfigInputProtocol | boolean>;
}

export interface ApiListenerConfig {
  name: string;
  bind: {
    host: string;
    port: number;
  };
  protocols: ApiListenerProtocolConfig;
}

export interface ApiListenerTransportStatus {
  enabled: boolean;
  path?: string;
  maxPayloadBytes?: number;
  maxMessageBytes?: number;
  error?: string;
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
  rootRoute?: boolean | ((c: Context) => Response | Promise<Response>);
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
  listeners: ApiListenerConfig[];
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
