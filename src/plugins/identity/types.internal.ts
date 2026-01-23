/**
 * Internal Types for Identity Plugin
 *
 * These types are used internally by the Identity plugin and should not be
 * exported to users. Users should only interact with IdentityPluginOptions.
 */

export interface IdentityCorsConfig {
  enabled: boolean;
  origin: string | string[];
  methods: string[];
  allowedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

export interface ContentSecurityPolicyConfig {
  enabled: boolean;
  directives: Record<string, string[]>;
  reportOnly: boolean;
  reportUri: string | null;
}

export interface IdentitySecurityConfig {
  enabled: boolean;
  contentSecurityPolicy: ContentSecurityPolicyConfig;
}

export interface IdentityLoggingConfig {
  enabled: boolean;
  format: string;
}

export interface OnboardingOptions {
  enabled: boolean;
  mode: 'interactive' | 'env' | 'config' | 'callback' | 'disabled';
  force: boolean;
  adminEmail?: string;
  adminPassword?: string;
  adminName?: string;
  admin?: {
    email: string;
    password: string;
    name?: string;
    scopes?: string[];
  };
  onFirstRun?: (context: any) => Promise<void>;
  interactive?: Record<string, any>;
  passwordPolicy?: Record<string, any>;
}

export interface SessionOptions {
  sessionExpiry: string;
  cookieName: string;
  cookiePath: string;
  cookieHttpOnly: boolean;
  cookieSecure: boolean;
  cookieSameSite: 'Strict' | 'Lax' | 'None';
  cleanupInterval: number;
  enableCleanup: boolean;
}

export interface PasswordPolicyConfig {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
  bcryptRounds: number;
}

export interface RegistrationConfig {
  enabled: boolean;
  requireEmailVerification: boolean;
  allowedDomains: string[] | null;
  blockedDomains: string[];
  customMessage: string | null;
}

export interface UIConfig {
  title: string;
  companyName: string;
  legalName: string;
  tagline: string;
  welcomeMessage: string;
  logoUrl: string | null;
  favicon: string | null;
  primaryColor: string;
  secondaryColor: string;
  successColor: string;
  dangerColor: string;
  warningColor: string;
  infoColor: string;
  textColor: string;
  textMuted: string;
  backgroundColor: string;
  backgroundLight: string;
  borderColor: string;
  fontFamily: string;
  fontSize: string;
  borderRadius: string;
  boxShadow: string;
  footerText: string | null;
  supportEmail: string | null;
  privacyUrl: string;
  termsUrl: string;
  socialLinks: Record<string, string> | null;
  customCSS: string | null;
  customPages: Record<string, string>;
  baseUrl: string;
}

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  tls: {
    rejectUnauthorized: boolean;
  };
}

export interface EmailTemplatesConfig {
  baseUrl: string;
  brandName: string;
  brandLogo: string | null;
  brandColor: string;
  supportEmail: string | null;
  customFooter: string | null;
}

export interface EmailConfig {
  enabled: boolean;
  from: string;
  replyTo: string | null;
  smtp: SMTPConfig;
  templates: EmailTemplatesConfig;
}

export interface MFAConfig {
  enabled: boolean;
  required: boolean;
  issuer: string;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: number;
  period: number;
  window: number;
  backupCodesCount: number;
  backupCodeLength: number;
}

export interface IdentityAuditConfig {
  enabled: boolean;
  includeData: boolean;
  includePartitions: boolean;
  maxDataSize: number;
  resources: string[];
  events: string[];
}

export interface AccountLockoutConfig {
  enabled: boolean;
  maxAttempts: number;
  lockoutDuration: number;
  resetOnSuccess: boolean;
}

export interface GeoConfig {
  enabled: boolean;
  databasePath: string | null;
  allowedCountries: string[];
  blockedCountries: string[];
  blockUnknown: boolean;
}

export interface FailbanEndpoints {
  login: boolean;
  token: boolean;
  register: boolean;
}

export interface IdentityFailbanConfig {
  enabled: boolean;
  maxViolations: number;
  violationWindow: number;
  banDuration: number;
  whitelist: string[];
  blacklist: string[];
  persistViolations: boolean;
  endpoints: FailbanEndpoints;
  geo: GeoConfig;
}

export interface RateLimitEndpoint {
  windowMs: number;
  max: number;
}

export interface IdentityRateLimitConfig {
  enabled: boolean;
  login: RateLimitEndpoint;
  token: RateLimitEndpoint;
  authorize: RateLimitEndpoint;
}

export interface PKCEConfig {
  enabled: boolean;
  required: boolean;
  methods: string[];
}

export interface FeaturesConfig {
  discovery: boolean;
  jwks: boolean;
  token: boolean;
  authorize: boolean;
  userinfo: boolean;
  introspection: boolean;
  revocation: boolean;
  registration: boolean;
  builtInLoginUI: boolean;
  customLoginHandler: ((req: any, res: any) => Promise<void>) | null;
  pkce: PKCEConfig;
  refreshTokens: boolean;
  refreshTokenRotation: boolean;
  revokeOldRefreshTokens: boolean;
}

export interface InternalResourceDescriptor {
  defaultName: string;
  override?: string;
}

export interface InternalResourceDescriptors {
  oauthKeys: InternalResourceDescriptor;
  authCodes: InternalResourceDescriptor;
  sessions: InternalResourceDescriptor;
  passwordResetTokens: InternalResourceDescriptor;
  mfaDevices: InternalResourceDescriptor;
}

export interface InternalResourceNames {
  oauthKeys: string;
  authCodes: string;
  sessions: string;
  passwordResetTokens: string;
  mfaDevices: string;
}

export interface AuthDriversConfig {
  disableBuiltIns?: boolean;
  drivers?: any[];
  custom?: any[];
  customDrivers?: any[];
  builtIns?: Record<string, any>;
  [key: string]: any;
}

export interface RegisterOAuthClientOptions {
  name?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUris: string[];
  allowedScopes?: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  tokenEndpointAuthMethod?: string;
  audiences?: string[];
  metadata?: Record<string, any>;
}

export interface CompleteOnboardingOptions {
  admin?: {
    email: string;
    password: string;
    name?: string;
    scopes?: string[];
  };
  clients?: Array<{
    name?: string;
    redirectUris: string[];
    [key: string]: any;
  }>;
}

export interface IntegrationMetadata {
  version: number;
  issuedAt: string;
  cacheTtl: number;
  issuer: string;
  discoveryUrl: string;
  jwksUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  introspectionUrl: string;
  revocationUrl: string;
  supportedScopes: string[];
  supportedGrantTypes: string[];
  supportedResponseTypes: string[];
  resources: {
    users: string;
    tenants: string;
    clients: string;
  };
  clientRegistration: {
    url: string;
    supportedAuth: string[];
  };
}

export interface AuthenticateWithPasswordParams {
  email: string;
  password: string;
  user?: any;
}

export interface Logger {
  info: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  debug: (message: string | Record<string, any>, ...args: any[]) => void;
}

export interface Resource {
  name: string;
  insert: (data: Record<string, any>) => Promise<any>;
  get: (id: string) => Promise<any>;
  update: (id: string, data: Record<string, any>) => Promise<any>;
  delete: (id: string) => Promise<void>;
  query: (filter: Record<string, any>) => Promise<any[]>;
  list: (options?: { limit?: number }) => Promise<any[]>;
}

export interface Database {
  createResource: (config: Record<string, any>) => Promise<Resource>;
  deleteResource: (name: string) => Promise<void>;
  resources: Record<string, Resource>;
  usePlugin: (plugin: any) => Promise<void>;
  pluginRegistry?: Record<string, any>;
}

import type { PreparedResourceConfigs } from './concerns/config.js';

export interface IdentityPluginConfig {
  port: number;
  host: string;
  logLevel: string;
  issuer: string;
  supportedScopes: string[];
  supportedGrantTypes: string[];
  supportedResponseTypes: string[];
  accessTokenExpiry: string;
  idTokenExpiry: string;
  refreshTokenExpiry: string;
  authCodeExpiry: string;
  resources: PreparedResourceConfigs;
  resourceNames: InternalResourceNames;
  cors: IdentityCorsConfig;
  security: IdentitySecurityConfig;
  logging: IdentityLoggingConfig;
  onboarding: OnboardingOptions;
  session: SessionOptions;
  passwordPolicy: PasswordPolicyConfig;
  registration: RegistrationConfig;
  ui: UIConfig;
  email: EmailConfig;
  mfa: MFAConfig;
  audit: IdentityAuditConfig;
  accountLockout: AccountLockoutConfig;
  failban: IdentityFailbanConfig;
  rateLimit: IdentityRateLimitConfig;
  features: FeaturesConfig;
  authDrivers: AuthDriversConfig | false;
}
