/**
 * Admin Users Management Page
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig, type BaseLayoutUser } from '../../layouts/base.js';
export type UserStatus = 'active' | 'suspended' | 'pending_verification';
export interface AdminUser {
    id: string;
    name: string;
    email: string;
    status: UserStatus | string;
    role?: string;
    emailVerified?: boolean;
    createdAt?: string;
    lockedUntil?: string;
    failedLoginAttempts?: number;
}
export interface SummaryCard {
    label: string;
    value: number;
    gradient: string;
}
export interface AdminUsersPageProps {
    users?: AdminUser[];
    user?: BaseLayoutUser;
    error?: string | null;
    success?: string | null;
    config?: ThemeConfig;
}
export declare function AdminUsersPage(props?: AdminUsersPageProps): HtmlEscapedString;
export default AdminUsersPage;
//# sourceMappingURL=users.d.ts.map