/**
 * MFA Enrollment Page
 * Shows QR code, manual entry key, and backup codes for MFA setup
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig } from '../layouts/base.js';
export interface MFAEnrollmentPageProps {
    qrCodeDataUrl?: string;
    secret?: string;
    backupCodes?: string[];
    config?: ThemeConfig;
}
export declare function MFAEnrollmentPage(props?: MFAEnrollmentPageProps): HtmlEscapedString;
export default MFAEnrollmentPage;
//# sourceMappingURL=mfa-enrollment.d.ts.map