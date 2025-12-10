/**
 * MFA Manager - Multi-Factor Authentication for Identity Plugin
 *
 * Handles TOTP (Time-based One-Time Password) generation, verification,
 * and backup codes management.
 *
 * Compatible with: Google Authenticator, Authy, Microsoft Authenticator, 1Password
 */
import { requirePluginDependency } from '../../concerns/plugin-dependencies.js';
import { idGenerator } from '../../../concerns/id.js';
import { PluginError } from '../../../errors.js';
export class MFAManager {
    options;
    OTPAuth;
    logger;
    constructor(options = {}) {
        this.options = {
            issuer: options.issuer || 'S3DB Identity',
            algorithm: options.algorithm || 'SHA1',
            digits: options.digits || 6,
            period: options.period || 30,
            window: options.window || 1,
            backupCodesCount: options.backupCodesCount || 10,
            backupCodeLength: options.backupCodeLength || 8
        };
        this.OTPAuth = null;
        this.logger = console;
    }
    async initialize() {
        this.OTPAuth = await requirePluginDependency('otpauth', 'IdentityPlugin (MFA)');
    }
    generateEnrollment(accountName) {
        if (!this.OTPAuth) {
            throw new PluginError('[MFA] OTPAuth library not initialized', {
                pluginName: 'IdentityPlugin',
                operation: 'mfaGenerateEnrollment',
                statusCode: 500,
                retriable: true,
                suggestion: 'Call MFAManager.initialize() before generating enrollments or ensure otpauth dependency installs successfully.'
            });
        }
        const totp = new this.OTPAuth.TOTP({
            issuer: this.options.issuer,
            label: accountName,
            algorithm: this.options.algorithm,
            digits: this.options.digits,
            period: this.options.period,
            secret: this.OTPAuth.Secret.fromBase32(this.OTPAuth.Secret.generate().base32)
        });
        const qrCodeUrl = totp.toString();
        const backupCodes = this.generateBackupCodes(this.options.backupCodesCount);
        return {
            secret: totp.secret.base32,
            qrCodeUrl,
            backupCodes,
            algorithm: this.options.algorithm,
            digits: this.options.digits,
            period: this.options.period
        };
    }
    verifyTOTP(secret, token) {
        if (!this.OTPAuth) {
            throw new PluginError('[MFA] OTPAuth library not initialized', {
                pluginName: 'IdentityPlugin',
                operation: 'mfaVerify',
                statusCode: 500,
                retriable: true,
                suggestion: 'Initialize MFAManager before verifying codes and confirm otpauth dependency is available.'
            });
        }
        try {
            const totp = new this.OTPAuth.TOTP({
                issuer: this.options.issuer,
                algorithm: this.options.algorithm,
                digits: this.options.digits,
                period: this.options.period,
                secret: this.OTPAuth.Secret.fromBase32(secret)
            });
            const delta = totp.validate({
                token,
                window: this.options.window
            });
            return delta !== null;
        }
        catch (error) {
            this.logger.error('[MFA] TOTP verification error:', error.message);
            return false;
        }
    }
    generateBackupCodes(count = 10) {
        const codes = [];
        const length = this.options.backupCodeLength;
        for (let i = 0; i < count; i++) {
            const code = idGenerator()
                .replace(/[^a-zA-Z0-9]/g, '')
                .substring(0, length)
                .toUpperCase();
            codes.push(code);
        }
        return codes;
    }
    async hashBackupCodes(codes) {
        const crypto = await import('crypto');
        return codes.map(code => {
            return crypto.createHash('sha256')
                .update(code)
                .digest('hex');
        });
    }
    async verifyBackupCode(code, hashedCodes) {
        const crypto = await import('crypto');
        const hashedInput = crypto.createHash('sha256')
            .update(code.toUpperCase())
            .digest('hex');
        return hashedCodes.findIndex(hash => hash === hashedInput);
    }
    async generateQRCodeDataURL(qrCodeUrl) {
        try {
            const QRCode = await requirePluginDependency('qrcode', 'IdentityPlugin (MFA)');
            return await QRCode.toDataURL(qrCodeUrl);
        }
        catch (error) {
            this.logger.error('[MFA] QR code generation error:', error.message);
            return null;
        }
    }
}
export default MFAManager;
//# sourceMappingURL=mfa-manager.js.map