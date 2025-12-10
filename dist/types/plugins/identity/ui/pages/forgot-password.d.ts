/**
 * Forgot Password Page
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig } from '../layouts/base.js';
export interface ForgotPasswordPageProps {
    error?: string | null;
    success?: string | null;
    email?: string;
    config?: ThemeConfig;
}
export declare function ForgotPasswordPage(props?: ForgotPasswordPageProps): HtmlEscapedString;
export default ForgotPasswordPage;
//# sourceMappingURL=forgot-password.d.ts.map