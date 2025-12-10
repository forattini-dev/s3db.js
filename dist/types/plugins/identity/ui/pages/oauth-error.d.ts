/**
 * OAuth Error Page
 * Shows OAuth2/OIDC error messages with proper formatting
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig } from '../layouts/base.js';
export interface ErrorInfo {
    icon: string;
    title: string;
    color: string;
}
export type OAuthErrorCode = 'invalid_request' | 'unauthorized_client' | 'access_denied' | 'unsupported_response_type' | 'invalid_scope' | 'server_error' | 'temporarily_unavailable' | 'invalid_client' | 'invalid_grant';
export interface OAuthErrorPageProps {
    error?: OAuthErrorCode | string;
    errorDescription?: string;
    errorUri?: string | null;
    config?: ThemeConfig;
}
export declare function OAuthErrorPage(props?: OAuthErrorPageProps): HtmlEscapedString;
export default OAuthErrorPage;
//# sourceMappingURL=oauth-error.d.ts.map