/**
 * MFA Verification Page
 * Shows 6-digit TOTP input or backup code entry
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig } from '../layouts/base.js';
export interface MFAVerificationPageProps {
    error?: string | null;
    email?: string;
    remember?: string;
    challenge?: string;
    config?: ThemeConfig;
}
export declare function MFAVerificationPage(props?: MFAVerificationPageProps): HtmlEscapedString;
export default MFAVerificationPage;
//# sourceMappingURL=mfa-verification.d.ts.map