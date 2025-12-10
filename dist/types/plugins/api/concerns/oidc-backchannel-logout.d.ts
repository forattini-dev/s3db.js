import type { JWTPayload, CryptoKey, KeyObject } from 'jose';
import type { Context } from 'hono';
type KeyLike = CryptoKey | KeyObject;
export interface OidcConfig {
    issuer: string;
    clientId: string;
    onBackchannelLogout?: (params: BackchannelLogoutEvent) => Promise<void>;
}
export interface BackchannelLogoutEvent {
    claims: LogoutTokenClaims;
    sessionIds: string[];
    loggedOut: number;
}
export interface LogoutTokenClaims extends JWTPayload {
    events?: Record<string, unknown>;
    sid?: string;
}
export interface SessionStore {
    destroy(sessionId: string): Promise<void>;
    findBySub?(sub: string): Promise<string[]>;
    findBySid?(sid: string): Promise<string[]>;
}
export interface LogoutValidationResult {
    valid: boolean;
    errors: string[] | null;
}
export interface BackchannelLogoutResult {
    success: boolean;
    sessionsLoggedOut?: number;
    error?: string;
    statusCode: number;
}
export interface DiscoveryDocument {
    backchannel_logout_supported?: boolean;
    [key: string]: unknown;
}
export interface BackchannelLogoutConfigValidation {
    valid: boolean;
    errors: string[] | null;
    warnings: string[] | null;
}
export interface BackchannelConfig extends OidcConfig {
    sessionStore?: SessionStore;
    backchannelLogoutUri?: string;
}
export declare function verifyBackchannelLogoutToken(logoutToken: string, config: OidcConfig, signingKey: KeyLike): Promise<LogoutTokenClaims>;
export declare function validateLogoutTokenClaims(claims: LogoutTokenClaims): LogoutValidationResult;
export declare function findSessionsToLogout(logoutToken: LogoutTokenClaims, sessionStore: SessionStore): Promise<string[]>;
export declare function handleBackchannelLogout(context: Context, config: OidcConfig, signingKey: KeyLike, sessionStore: SessionStore): Promise<BackchannelLogoutResult>;
interface HonoApp {
    post(path: string, handler: (c: Context) => Promise<Response>): void;
}
export declare function registerBackchannelLogoutRoute(app: HonoApp, path: string, config: OidcConfig, signingKey: KeyLike, sessionStore: SessionStore): void;
export declare function providerSupportsBackchannelLogout(discoveryDoc: DiscoveryDocument | null): boolean;
export declare function getBackchannelLogoutUri(baseUrl: string, logoutPath?: string): string;
export declare function validateBackchannelLogoutConfig(config: BackchannelConfig, discoveryDoc: DiscoveryDocument | null): BackchannelLogoutConfigValidation;
export {};
//# sourceMappingURL=oidc-backchannel-logout.d.ts.map