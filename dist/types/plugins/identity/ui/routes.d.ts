/**
 * Identity Provider UI Routes
 * Handles login, registration, logout, and other UI endpoints
 */
import type { Context, Hono } from 'hono';
import type { HtmlEscapedString } from 'hono/utils/html';
import type { ThemeConfig } from './layouts/base.js';
export interface UIConfig extends ThemeConfig {
    registrationEnabled: boolean;
}
export interface PasswordPolicy {
    minLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireNumbers?: boolean;
    requireSpecial?: boolean;
}
export interface MFAConfig {
    enabled: boolean;
    required?: boolean;
    backupCodesCount?: number;
}
export interface RegistrationConfig {
    enabled: boolean;
    requireEmailVerification?: boolean;
    customMessage?: string;
    blockedDomains?: string[];
    allowedDomains?: string[];
}
export interface SessionConfig {
    sessionExpiry?: string;
}
export interface AccountLockoutConfig {
    enabled: boolean;
    maxAttempts?: number;
    lockoutDuration?: number;
    resetOnSuccess?: boolean;
}
export interface FailbanConfig {
    endpoints: {
        login?: boolean;
    };
}
export interface IdentityPluginConfig {
    ui: UIConfig & {
        customPages?: Record<string, PageComponentType>;
        baseUrl?: string;
    };
    registration: RegistrationConfig;
    passwordPolicy?: PasswordPolicy;
    session: SessionConfig;
    mfa: MFAConfig;
    failban?: FailbanConfig;
    accountLockout?: AccountLockoutConfig;
    supportedScopes?: string[];
    supportedGrantTypes?: string[];
    issuer?: string;
    logLevel?: string;
    resources?: {
        users?: {
            mergedConfig?: {
                attributes?: Record<string, unknown>;
            };
        };
    };
}
export interface SessionManager {
    getSessionIdFromRequest(req: unknown): string | null;
    validateSession(sessionId: string): Promise<{
        valid: boolean;
        session?: unknown;
    }>;
    createSession(options: {
        userId: string;
        metadata: Record<string, unknown>;
        ipAddress: string;
        userAgent: string;
        duration: string;
    }): Promise<{
        sessionId: string;
        expiresAt: string;
    }>;
    destroySession(sessionId: string): Promise<void>;
    destroyUserSessions(userId: string): Promise<void>;
    setSessionCookie(c: Context, sessionId: string, expiresAt: string): void;
    clearSessionCookie(c: Context): void;
    getSession(sessionId: string): Promise<unknown>;
    getUserSessions(userId: string): Promise<Array<{
        id: string;
        [key: string]: unknown;
    }>>;
}
export interface KeyManager {
    createToken(payload: Record<string, unknown>, expiresIn: string): string;
    verifyToken(token: string): Promise<{
        payload: Record<string, unknown>;
    } | null>;
}
export interface MFAManager {
    generateEnrollment(email: string): {
        secret: string;
        qrCodeUrl: string;
        backupCodes: string[];
    };
    generateQRCodeDataURL(url: string): Promise<string>;
    verifyTOTP(secret: string, token: string): boolean;
    hashBackupCodes(codes: string[]): Promise<string[]>;
    verifyBackupCode(code: string, hashedCodes: string[]): Promise<number | null>;
    generateBackupCodes(count: number): string[];
}
export interface RateLimiter {
    check(key: string): Promise<{
        allowed: boolean;
        retryAfter?: number;
    }>;
}
export interface FailbanManager {
    recordViolation(ip: string, type: string, metadata: Record<string, unknown>): Promise<void>;
}
export interface EmailService {
    config: {
        enabled: boolean;
    };
    sendPasswordResetEmail(options: {
        to: string;
        name: string;
        resetToken: string;
        expiresIn: number;
    } | string, data?: {
        name: string;
        resetUrl: string;
    }): Promise<void>;
    sendEmailVerificationEmail(options: {
        to: string;
        name: string;
        verificationToken: string;
    }): Promise<void>;
}
export interface AuditPlugin {
    log(entry: {
        action: string;
        userId?: string;
        resource: string;
        resourceId: string;
        metadata: Record<string, unknown>;
    }): Promise<void>;
}
export interface Resource<T = Record<string, unknown>> {
    get(id: string): Promise<T>;
    insert(data: Partial<T>): Promise<T>;
    update(id: string, data: Partial<T>): Promise<T>;
    patch(id: string, data: Partial<T>): Promise<T>;
    delete(id: string): Promise<void>;
    remove?(id: string): Promise<void>;
    list(options?: {
        limit?: number;
    }): Promise<T[]>;
    query(filter: Partial<T>): Promise<T[]>;
}
export interface UserRecord {
    id: string;
    email: string;
    name: string;
    password: string;
    isAdmin?: boolean;
    emailVerified?: boolean;
    active?: boolean;
    status?: string;
    role?: string;
    registrationIp?: string;
    lastLoginAt?: string | null;
    lastLoginIp?: string | null;
    lockedUntil?: string | null;
    failedLoginAttempts?: number;
    lastFailedLogin?: string | null;
    emailVerificationToken?: string | null;
    emailVerificationExpiry?: string | null;
    passwordResetToken?: string | null;
    passwordResetExpiry?: string | null;
}
export interface OAuth2Client {
    id: string;
    clientId: string;
    clientSecret: string;
    name: string;
    redirectUris: string[];
    grantTypes: string[];
    allowedScopes: string[];
    active: boolean;
}
export interface MFADevice {
    id: string;
    userId: string;
    type: string;
    secret: string;
    verified: boolean;
    backupCodes: string[];
    enrolledAt: string;
    deviceName: string;
    lastUsedAt?: string;
}
export interface AuthCode {
    id: string;
    code: string;
    clientId: string;
    userId: string;
    redirectUri: string;
    scope: string[];
    codeChallenge?: string | null;
    codeChallengeMethod?: string;
    expiresAt: string;
    used: boolean;
    trusted?: boolean;
}
export interface PasswordResetToken {
    id: string;
    userId: string;
    token: string;
    expiresAt: string;
    used: boolean;
}
export interface Session {
    id: string;
    userId: string;
    expiresAt: string;
    [key: string]: unknown;
}
export interface IdentityPlugin {
    sessionManager: SessionManager;
    usersResource: Resource<UserRecord>;
    config: IdentityPluginConfig;
    failbanManager?: FailbanManager;
    oauth2Server?: {
        keyManager?: KeyManager;
    };
    mfaManager?: MFAManager;
    mfaDevicesResource?: Resource<MFADevice>;
    oauth2ClientsResource: Resource<OAuth2Client>;
    oauth2AuthCodesResource: Resource<AuthCode>;
    passwordResetTokensResource: Resource<PasswordResetToken>;
    sessionsResource: Resource<Session>;
    emailService?: EmailService;
    auditPlugin?: AuditPlugin;
    rateLimiters?: {
        login?: RateLimiter;
    };
    logger?: {
        info: (...args: unknown[]) => void;
        error: (...args: unknown[]) => void;
    };
    authenticateWithPassword(options: {
        email: string;
        password: string;
        user: UserRecord;
    }): Promise<{
        success: boolean;
        statusCode?: number;
        error?: string;
        user?: UserRecord;
    }>;
    _logAuditEvent?(event: string, data: Record<string, unknown>): Promise<void>;
}
export type PageComponentType = (props: Record<string, unknown>) => HtmlEscapedString;
export declare function registerUIRoutes(app: Hono, plugin: IdentityPlugin): void;
export default registerUIRoutes;
//# sourceMappingURL=routes.d.ts.map