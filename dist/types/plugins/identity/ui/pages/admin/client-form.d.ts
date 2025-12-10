/**
 * Admin OAuth2 Client Form Page (Create/Edit)
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig, type BaseLayoutUser } from '../../layouts/base.js';
export interface ClientData {
    id?: string;
    name: string;
    redirectUris: string[];
    grantTypes: string[];
    allowedScopes: string[];
    active: boolean;
}
export interface AdminClientFormPageProps {
    client?: ClientData | null;
    user?: BaseLayoutUser;
    error?: string | null;
    availableScopes?: string[];
    availableGrantTypes?: string[];
    config?: ThemeConfig;
}
export declare function AdminClientFormPage(props?: AdminClientFormPageProps): HtmlEscapedString;
export default AdminClientFormPage;
//# sourceMappingURL=client-form.d.ts.map