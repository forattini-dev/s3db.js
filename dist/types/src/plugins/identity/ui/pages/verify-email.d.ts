/**
 * Email Verification Page
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig } from '../layouts/base.js';
export type VerificationStatus = 'success' | 'error' | 'expired' | 'pending';
export interface VerifyEmailPageProps {
    status?: VerificationStatus;
    email?: string;
    message?: string;
    config?: ThemeConfig;
}
export declare function VerifyEmailPage(props?: VerifyEmailPageProps): HtmlEscapedString;
export default VerifyEmailPage;
//# sourceMappingURL=verify-email.d.ts.map