/**
 * OAuth2 Consent Screen Page
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig, type BaseLayoutUser } from '../layouts/base.js';
export interface ScopeDescription {
    name: string;
    description: string;
    icon: string;
}
export interface OAuthClient {
    clientId: string;
    name?: string;
    description?: string;
    [key: string]: any;
}
export interface ConsentPageProps {
    client?: OAuthClient;
    scopes?: string[];
    user?: BaseLayoutUser;
    responseType?: string;
    redirectUri?: string;
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    error?: string | null;
    config?: ThemeConfig;
}
export declare function ConsentPage(props?: ConsentPageProps): HtmlEscapedString;
export default ConsentPage;
//# sourceMappingURL=consent.d.ts.map