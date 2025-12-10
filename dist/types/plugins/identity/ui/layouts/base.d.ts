/**
 * Base HTML Layout for Identity Provider UI
 * Uses Hono's html helper for server-side rendering
 */
import type { HtmlEscapedString } from 'hono/utils/html';
export interface ThemeConfig {
    title?: string;
    logo?: string | null;
    logoUrl?: string | null;
    favicon?: string | null;
    registrationEnabled?: boolean;
    primaryColor?: string;
    secondaryColor?: string;
    successColor?: string;
    dangerColor?: string;
    warningColor?: string;
    infoColor?: string;
    textColor?: string;
    textMuted?: string;
    backgroundColor?: string;
    backgroundLight?: string;
    borderColor?: string;
    fontFamily?: string;
    fontSize?: string;
    borderRadius?: string;
    boxShadow?: string;
    companyName?: string;
    legalName?: string;
    tagline?: string;
    welcomeMessage?: string;
    footerText?: string | null;
    supportEmail?: string | null;
    privacyUrl?: string;
    termsUrl?: string;
    socialLinks?: Record<string, string> | null;
    customCSS?: string | null;
}
export interface BaseLayoutUser {
    id?: string;
    name?: string;
    email?: string;
    isAdmin?: boolean;
    [key: string]: any;
}
export interface BaseLayoutProps {
    title?: string;
    content?: string | HtmlEscapedString;
    user?: BaseLayoutUser | null;
    config?: ThemeConfig;
    error?: string | null;
    success?: string | null;
}
export declare function BaseLayout(props: BaseLayoutProps): HtmlEscapedString;
export default BaseLayout;
//# sourceMappingURL=base.d.ts.map