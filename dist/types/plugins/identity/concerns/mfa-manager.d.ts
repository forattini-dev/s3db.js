/**
 * MFA Manager - Multi-Factor Authentication for Identity Plugin
 *
 * Handles TOTP (Time-based One-Time Password) generation, verification,
 * and backup codes management.
 *
 * Compatible with: Google Authenticator, Authy, Microsoft Authenticator, 1Password
 */
export type TOTPAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';
export interface MFAManagerOptions {
    issuer?: string;
    algorithm?: TOTPAlgorithm;
    digits?: number;
    period?: number;
    window?: number;
    backupCodesCount?: number;
    backupCodeLength?: number;
}
export interface MFAEnrollment {
    secret: string;
    qrCodeUrl: string;
    backupCodes: string[];
    algorithm: TOTPAlgorithm;
    digits: number;
    period: number;
}
export declare class MFAManager {
    private options;
    private OTPAuth;
    private logger;
    constructor(options?: MFAManagerOptions);
    initialize(): Promise<void>;
    generateEnrollment(accountName: string): MFAEnrollment;
    verifyTOTP(secret: string, token: string): boolean;
    generateBackupCodes(count?: number): string[];
    hashBackupCodes(codes: string[]): Promise<string[]>;
    verifyBackupCode(code: string, hashedCodes: string[]): Promise<number>;
    generateQRCodeDataURL(qrCodeUrl: string): Promise<string | null>;
}
export default MFAManager;
//# sourceMappingURL=mfa-manager.d.ts.map