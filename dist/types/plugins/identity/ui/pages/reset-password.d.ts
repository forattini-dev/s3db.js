/**
 * Reset Password Page
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig } from '../layouts/base.js';
import type { PasswordPolicy } from './register.js';
export interface ResetPasswordPageProps {
    error?: string | null;
    token?: string;
    passwordPolicy?: PasswordPolicy;
    config?: ThemeConfig;
}
export declare function ResetPasswordPage(props?: ResetPasswordPageProps): HtmlEscapedString;
export default ResetPasswordPage;
//# sourceMappingURL=reset-password.d.ts.map