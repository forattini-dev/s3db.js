/**
 * Identity Provider Plugin - OAuth2/OIDC Authorization Server
 *
 * Provides complete OAuth2 + OpenID Connect server functionality:
 * - RSA key management for token signing
 * - OAuth2 grant types (authorization_code, client_credentials, refresh_token)
 * - OIDC flows (id_token, userinfo endpoint)
 * - Token introspection
 * - Client registration
 *
 * @example
 * import { Database } from 's3db.js';
 * import { IdentityPlugin } from 's3db.js/plugins/identity';
 *
 * const db = new Database({ connectionString: '...' });
 * await db.connect();
 *
 * await db.usePlugin(new IdentityPlugin({
 *   port: 4000,
 *   issuer: 'http://localhost:4000',
 *   supportedScopes: ['openid', 'profile', 'email', 'read:api', 'write:api'],
 *   supportedGrantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
 *   accessTokenExpiry: '15m',
 *   idTokenExpiry: '15m',
 *   refreshTokenExpiry: '7d'
 * }));
 */
import { Plugin } from '../plugin.class.js';
import { OAuth2Server } from './oauth2-server.js';
import { RateLimiter } from './concerns/rate-limit.js';
import { type PreparedResourceConfigs } from './concerns/config.js';
import { AuthDriver } from './drivers/auth-driver.interface.js';
import { OnboardingManager } from './concerns/onboarding-manager.js';
import type { KeyManager } from './rsa-keys.js';
import type { SessionManager } from './session-manager.js';
import type { EmailService } from './email-service.js';
import type { FailbanManager } from '../../concerns/failban-manager.js';
import type { AuditPlugin } from '../audit.plugin.js';
import type { MFAManager } from './concerns/mfa-manager.js';
import type { IdentityServer } from './server.js';
export interface CorsConfig {
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
export interface SecurityConfig {
    enabled: boolean;
    contentSecurityPolicy: ContentSecurityPolicyConfig;
}
export interface LoggingConfig {
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
    logo: string | null;
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
export interface AuditConfig {
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
export interface FailbanConfig {
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
export interface RateLimitConfig {
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
    cors: CorsConfig;
    security: SecurityConfig;
    logging: LoggingConfig;
    onboarding: OnboardingOptions;
    session: SessionOptions;
    passwordPolicy: PasswordPolicyConfig;
    registration: RegistrationConfig;
    ui: UIConfig;
    email: EmailConfig;
    mfa: MFAConfig;
    audit: AuditConfig;
    accountLockout: AccountLockoutConfig;
    failban: FailbanConfig;
    rateLimit: RateLimitConfig;
    features: FeaturesConfig;
    authDrivers: AuthDriversConfig | false;
}
export interface AuthDriversConfig {
    disableBuiltIns?: boolean;
    drivers?: AuthDriver[];
    custom?: AuthDriver[];
    customDrivers?: AuthDriver[];
    builtIns?: Record<string, any>;
    [key: string]: any;
}
export interface IdentityPluginOptions {
    port?: number;
    host?: string;
    logLevel?: string;
    issuer?: string;
    supportedScopes?: string[];
    supportedGrantTypes?: string[];
    supportedResponseTypes?: string[];
    accessTokenExpiry?: string;
    idTokenExpiry?: string;
    refreshTokenExpiry?: string;
    authCodeExpiry?: string;
    resources?: any;
    resourceNames?: Partial<InternalResourceNames>;
    internalResources?: Partial<InternalResourceNames>;
    cors?: Partial<CorsConfig>;
    security?: Partial<SecurityConfig>;
    logging?: Partial<LoggingConfig>;
    onboarding?: Partial<OnboardingOptions>;
    session?: Partial<SessionOptions>;
    passwordPolicy?: Partial<PasswordPolicyConfig>;
    registration?: Partial<RegistrationConfig>;
    ui?: Partial<UIConfig> & {
        logo?: string;
    };
    email?: Partial<EmailConfig>;
    mfa?: Partial<MFAConfig>;
    audit?: Partial<AuditConfig>;
    accountLockout?: Partial<AccountLockoutConfig>;
    failban?: Partial<FailbanConfig>;
    rateLimit?: Partial<RateLimitConfig>;
    features?: Partial<FeaturesConfig>;
    authDrivers?: AuthDriversConfig | false;
    [key: string]: unknown;
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
export interface RegisterOAuthClientResult {
    clientId: string;
    clientSecret: string;
    redirectUris: string[];
    allowedScopes: string[];
    grantTypes: string[];
    responseTypes: string[];
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
export interface OnboardingStatus {
    completed: boolean;
    error?: string;
    [key: string]: any;
}
export interface ServerInfo {
    isRunning: boolean;
    [key: string]: any;
}
export interface AuthenticateWithPasswordParams {
    email: string;
    password: string;
    user?: any;
}
export interface AuthenticateWithPasswordResult {
    success: boolean;
    error?: string;
    statusCode?: number;
    user?: Record<string, any>;
}
interface Resource {
    name: string;
    insert: (data: Record<string, any>) => Promise<any>;
    get: (id: string) => Promise<any>;
    update: (id: string, data: Record<string, any>) => Promise<any>;
    delete: (id: string) => Promise<void>;
    query: (filter: Record<string, any>) => Promise<any[]>;
    list: (options?: {
        limit?: number;
    }) => Promise<any[]>;
}
/**
 * Identity Provider Plugin class
 */
export declare class IdentityPlugin extends Plugin {
    config: IdentityPluginConfig;
    namespace: string;
    private _internalResourceOverrides;
    private _internalResourceDescriptors;
    internalResourceNames: InternalResourceNames;
    server: IdentityServer | null;
    oauth2Server: OAuth2Server | null;
    sessionManager: SessionManager | null;
    emailService: EmailService | null;
    failbanManager: FailbanManager | null;
    auditPlugin: AuditPlugin | null;
    mfaManager: MFAManager | null;
    onboardingManager: OnboardingManager;
    keyManager: KeyManager | null;
    oauth2KeysResource: Resource | null;
    oauth2AuthCodesResource: Resource | null;
    sessionsResource: Resource | null;
    passwordResetTokensResource: Resource | null;
    mfaDevicesResource: Resource | null;
    usersResource: Resource | null;
    tenantsResource: Resource | null;
    clientsResource: Resource | null;
    rateLimiters: Record<string, RateLimiter>;
    authDrivers: Map<string, AuthDriver>;
    authDriverInstances: AuthDriver[];
    constructor(options?: IdentityPluginOptions);
    private _resolveInternalResourceNames;
    onNamespaceChanged(): void;
    private _validateDependencies;
    private _createRateLimiters;
    onInstall(): Promise<void>;
    private _exposeIntegrationMetadata;
    private _createOAuth2Resources;
    private _createUserManagedResources;
    private _initializeOAuth2Server;
    private _initializeSessionManager;
    private _initializeEmailService;
    private _initializeFailbanManager;
    private _initializeAuditPlugin;
    private _logAuditEvent;
    private _initializeMFAManager;
    private _initializeAuthDrivers;
    getAuthDriver(type: string): AuthDriver | undefined;
    private _sanitizeAuthSubject;
    authenticateWithPassword(params: AuthenticateWithPasswordParams): Promise<AuthenticateWithPasswordResult>;
    private _collectCustomAuthDrivers;
    private _extractBuiltInDriverOptions;
    private _isPlainObject;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    onUninstall(options?: {
        purgeData?: boolean;
    }): Promise<void>;
    getServerInfo(): ServerInfo;
    getOAuth2Server(): OAuth2Server | null;
    registerOAuthClient(options: RegisterOAuthClientOptions): Promise<RegisterOAuthClientResult>;
    private _runOnboarding;
    getOnboardingStatus(): Promise<OnboardingStatus>;
    completeOnboarding(options?: CompleteOnboardingOptions): Promise<void>;
    markOnboardingComplete(): Promise<void>;
    getIntegrationMetadata(): IntegrationMetadata;
}
export default IdentityPlugin;
//# sourceMappingURL=index.d.ts.map