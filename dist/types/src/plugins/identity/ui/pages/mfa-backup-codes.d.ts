/**
 * MFA Backup Codes Page
 * Shows newly regenerated backup codes
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig } from '../layouts/base.js';
export interface MFABackupCodesPageProps {
    backupCodes?: string[];
    config?: ThemeConfig;
}
export declare function MFABackupCodesPage(props?: MFABackupCodesPageProps): HtmlEscapedString;
export default MFABackupCodesPage;
//# sourceMappingURL=mfa-backup-codes.d.ts.map