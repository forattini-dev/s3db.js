import type { Context } from 'hono';
export interface SilentLoginOptions {
    enableSilentLogin?: boolean;
    silentLoginPaths?: string[];
    excludePaths?: string[];
}
export interface CookieOptions {
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    domain?: string | null;
    path?: string;
}
export interface OAuthError {
    error?: string;
    code?: string;
    error_description?: string;
}
export interface SilentLoginErrorResult {
    shouldRedirectToLogin: boolean;
    reason: string;
    message: string;
}
export interface SilentLoginParams {
    [key: string]: string | undefined | null;
}
export declare function shouldAttemptSilentLogin(context: Context, options?: SilentLoginOptions): boolean;
export declare function markSilentLoginAttempted(context: Context, options?: CookieOptions): void;
export declare function clearSilentLoginAttempt(context: Context, options?: CookieOptions): void;
export declare function handleSilentLoginError(error: OAuthError): SilentLoginErrorResult;
export declare function buildSilentLoginUrl(baseAuthUrl: string, params: SilentLoginParams): string;
//# sourceMappingURL=oidc-silent-login.d.ts.map