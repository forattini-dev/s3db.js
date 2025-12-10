/**
 * Admin OAuth2 Clients Management Page
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig, type BaseLayoutUser } from '../../layouts/base.js';
export interface OAuthClient {
    id: string;
    clientId: string;
    name: string;
    active?: boolean;
    grantTypes?: string[];
    allowedScopes?: string[];
    redirectUris?: string[];
    createdAt?: string;
}
export interface AdminClientsPageProps {
    clients?: OAuthClient[];
    user?: BaseLayoutUser;
    error?: string | null;
    success?: string | null;
    config?: ThemeConfig;
}
export declare function AdminClientsPage(props?: AdminClientsPageProps): HtmlEscapedString;
export default AdminClientsPage;
//# sourceMappingURL=clients.d.ts.map