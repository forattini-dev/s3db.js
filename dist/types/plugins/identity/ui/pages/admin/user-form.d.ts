/**
 * Admin User Edit Form Page
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig, type BaseLayoutUser } from '../../layouts/base.js';
export interface EditUser {
    id: string;
    name: string;
    email: string;
    status: string;
    role?: string;
    emailVerified?: boolean;
    createdAt?: string;
    updatedAt?: string;
    lastLoginAt?: string;
}
export interface StatusOption {
    value: string;
    title: string;
    description: string;
}
export interface RoleOption {
    value: string;
    title: string;
    description: string;
}
export interface AdminUserFormPageProps {
    editUser?: EditUser;
    user?: BaseLayoutUser;
    error?: string | null;
    config?: ThemeConfig;
}
export declare function AdminUserFormPage(props?: AdminUserFormPageProps): HtmlEscapedString;
export default AdminUserFormPage;
//# sourceMappingURL=user-form.d.ts.map