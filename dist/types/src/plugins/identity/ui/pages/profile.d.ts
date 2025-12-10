/**
 * User Profile Page
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig, type BaseLayoutUser } from '../layouts/base.js';
import type { PasswordPolicy } from './register.js';
export interface ProfileUser extends BaseLayoutUser {
    status?: 'active' | 'pending_verification' | 'suspended' | string;
    emailVerified?: boolean;
    lastLoginAt?: string;
    lastLoginIp?: string;
    createdAt?: string;
}
export interface ProfileSession {
    id: string;
    isCurrent?: boolean;
    createdAt?: string;
    expiresAt?: string;
    userAgent?: string;
    ipAddress?: string;
}
export interface ProfilePageProps {
    user?: ProfileUser;
    sessions?: ProfileSession[];
    error?: string | null;
    success?: string | null;
    passwordPolicy?: PasswordPolicy;
    config?: ThemeConfig;
}
export declare function ProfilePage(props?: ProfilePageProps): HtmlEscapedString;
export default ProfilePage;
//# sourceMappingURL=profile.d.ts.map