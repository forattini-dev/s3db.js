/**
 * Login Page
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig } from '../layouts/base.js';
export interface LoginPageConfig extends ThemeConfig {
    heroTitle?: string;
    heroSubtitle?: string;
    heroFooter?: string;
}
export interface LoginPageProps {
    error?: string | null;
    success?: string | null;
    email?: string;
    config?: LoginPageConfig;
}
export declare function LoginPage(props?: LoginPageProps): HtmlEscapedString;
export default LoginPage;
//# sourceMappingURL=login.d.ts.map