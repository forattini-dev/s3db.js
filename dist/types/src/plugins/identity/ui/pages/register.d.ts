/**
 * Registration Page
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig } from '../layouts/base.js';
export interface PasswordPolicy {
    minLength?: number;
    maxLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireNumbers?: boolean;
    requireSymbols?: boolean;
}
export interface RegisterPageProps {
    error?: string | null;
    email?: string;
    name?: string;
    passwordPolicy?: PasswordPolicy;
    config?: ThemeConfig;
}
export declare function RegisterPage(props?: RegisterPageProps): HtmlEscapedString;
export default RegisterPage;
//# sourceMappingURL=register.d.ts.map