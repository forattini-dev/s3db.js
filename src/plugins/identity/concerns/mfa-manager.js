/**
 * MFA Manager - Multi-Factor Authentication for Identity Plugin
 *
 * Handles TOTP (Time-based One-Time Password) generation, verification,
 * and backup codes management.
 *
 * Compatible with: Google Authenticator, Authy, Microsoft Authenticator, 1Password
 *
 * @example
 * import { MFAManager } from './concerns/mfa-manager.js';
 *
 * const mfaManager = new MFAManager({
 *   issuer: 'MyApp',
 *   algorithm: 'SHA1',
 *   digits: 6,
 *   period: 30
 * });
 *
 * // Enroll user
 * const enrollment = await mfaManager.generateEnrollment('user@example.com');
 * console.log(enrollment.qrCodeUrl);  // Display QR code
 * console.log(enrollment.secret);     // Manual entry key
 *
 * // Verify TOTP token
 * const isValid = mfaManager.verifyTOTP(enrollment.secret, '123456');
 *
 * // Generate backup codes
 * const backupCodes = mfaManager.generateBackupCodes(10);
 */

import { requirePluginDependency } from '../../concerns/plugin-dependencies.js';
import { idGenerator } from '../../../concerns/id.js';

export class MFAManager {
  constructor(options = {}) {
    this.options = {
      issuer: options.issuer || 'S3DB Identity',
      algorithm: options.algorithm || 'SHA1',      // SHA1, SHA256, SHA512
      digits: options.digits || 6,                 // 6 or 8 digits
      period: options.period || 30,                // 30 seconds
      window: options.window || 1,                 // Allow ±1 time step (90s total)
      backupCodesCount: options.backupCodesCount || 10,
      backupCodeLength: options.backupCodeLength || 8
    };

    this.OTPAuth = null;
  }

  /**
   * Initialize MFA Manager (load otpauth library)
   */
  async initialize() {
    this.OTPAuth = await requirePluginDependency(
      'otpauth',
      'IdentityPlugin (MFA)',
      'Multi-Factor Authentication'
    );
  }

  /**
   * Generate MFA enrollment data for a user
   * @param {string} accountName - User email or username
   * @returns {Object} Enrollment data with secret, QR code URL, and backup codes
   */
  generateEnrollment(accountName) {
    if (!this.OTPAuth) {
      throw new Error('[MFA] OTPAuth library not initialized');
    }

    // Generate TOTP secret
    const totp = new this.OTPAuth.TOTP({
      issuer: this.options.issuer,
      label: accountName,
      algorithm: this.options.algorithm,
      digits: this.options.digits,
      period: this.options.period,
      secret: this.OTPAuth.Secret.fromBase32(
        this.OTPAuth.Secret.generate().base32
      )
    });

    // Generate QR code URL
    const qrCodeUrl = totp.toString();

    // Generate backup codes
    const backupCodes = this.generateBackupCodes(this.options.backupCodesCount);

    return {
      secret: totp.secret.base32,           // For manual entry
      qrCodeUrl,                            // For QR code scanning
      backupCodes,                          // Emergency access codes
      algorithm: this.options.algorithm,
      digits: this.options.digits,
      period: this.options.period
    };
  }

  /**
   * Verify a TOTP token
   * @param {string} secret - Base32 encoded secret
   * @param {string} token - 6-digit token from authenticator app
   * @returns {boolean} True if valid
   */
  verifyTOTP(secret, token) {
    if (!this.OTPAuth) {
      throw new Error('[MFA] OTPAuth library not initialized');
    }

    try {
      const totp = new this.OTPAuth.TOTP({
        issuer: this.options.issuer,
        algorithm: this.options.algorithm,
        digits: this.options.digits,
        period: this.options.period,
        secret: this.OTPAuth.Secret.fromBase32(secret)
      });

      // Validate token with time window
      const delta = totp.validate({
        token,
        window: this.options.window
      });

      // delta is null if invalid, or number if valid
      return delta !== null;
    } catch (error) {
      console.error('[MFA] TOTP verification error:', error.message);
      return false;
    }
  }

  /**
   * Generate backup codes for emergency access
   * @param {number} count - Number of codes to generate
   * @returns {Array<string>} Array of backup codes
   */
  generateBackupCodes(count = 10) {
    const codes = [];
    const length = this.options.backupCodeLength;

    for (let i = 0; i < count; i++) {
      // Generate random alphanumeric code
      const code = idGenerator()
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, length)
        .toUpperCase();

      codes.push(code);
    }

    return codes;
  }

  /**
   * Hash backup codes for storage
   * @param {Array<string>} codes - Backup codes
   * @returns {Array<string>} Hashed codes
   */
  async hashBackupCodes(codes) {
    const crypto = await import('crypto');
    return codes.map(code => {
      return crypto.createHash('sha256')
        .update(code)
        .digest('hex');
    });
  }

  /**
   * Verify a backup code
   * @param {string} code - Backup code to verify
   * @param {Array<string>} hashedCodes - Array of hashed backup codes
   * @returns {number|null} Index of matched code, or null if not found
   */
  async verifyBackupCode(code, hashedCodes) {
    const crypto = await import('crypto');
    const hashedInput = crypto.createHash('sha256')
      .update(code.toUpperCase())
      .digest('hex');

    return hashedCodes.findIndex(hash => hash === hashedInput);
  }

  /**
   * Generate QR code data URL for display
   * @param {string} qrCodeUrl - OTP auth URL
   * @returns {Promise<string>} Data URL for QR code image
   */
  async generateQRCodeDataURL(qrCodeUrl) {
    try {
      const QRCode = await requirePluginDependency(
        'qrcode',
        'IdentityPlugin (MFA)',
        'QR code generation for MFA enrollment'
      );

      return await QRCode.toDataURL(qrCodeUrl);
    } catch (error) {
      console.error('[MFA] QR code generation error:', error.message);
      return null;
    }
  }
}

export default MFAManager;
