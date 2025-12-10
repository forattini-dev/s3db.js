/**
 * Secure Token Generator
 *
 * Generates cryptographically secure random tokens for various use cases:
 * - Password reset tokens
 * - Email verification tokens
 * - API tokens
 * - Session IDs
 */
import { randomBytes } from 'crypto';
import { idGenerator } from '../../../concerns/id.js';
import { PluginError } from '../../../errors.js';
export function generateToken(bytes = 32, encoding = 'hex') {
    const buffer = randomBytes(bytes);
    switch (encoding) {
        case 'hex':
            return buffer.toString('hex');
        case 'base64':
            return buffer.toString('base64');
        case 'base64url':
            return buffer.toString('base64url');
        default:
            throw new PluginError(`Invalid encoding: ${encoding}. Use 'hex', 'base64', or 'base64url'.`, {
                pluginName: 'IdentityPlugin',
                operation: 'generateToken',
                statusCode: 400,
                retriable: false,
                suggestion: 'Pass encoding as "hex", "base64", or "base64url" when calling generateToken.'
            });
    }
}
export function generatePasswordResetToken() {
    return generateToken(32, 'hex');
}
export function generateEmailVerificationToken() {
    return generateToken(32, 'hex');
}
export function generateSessionId() {
    return idGenerator();
}
export function generateAPIKey() {
    return generateToken(32, 'hex');
}
export function generateNumericCode(length = 6) {
    const max = Math.pow(10, length);
    const min = Math.pow(10, length - 1);
    const randomNum = Math.floor(min + Math.random() * (max - min));
    return randomNum.toString().padStart(length, '0');
}
export function generateAlphanumericCode(length = 8) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const buffer = randomBytes(length);
    for (let i = 0; i < length; i++) {
        code += chars[buffer[i] % chars.length];
    }
    return code;
}
export function generateCSRFToken() {
    return generateToken(16, 'hex');
}
export function calculateExpiration(duration) {
    let ms;
    if (typeof duration === 'number') {
        ms = duration;
    }
    else if (typeof duration === 'string') {
        const match = duration.match(/^(\d+)([smhd])$/);
        if (!match) {
            throw new PluginError(`Invalid duration format: ${duration}. Use '15m', '1h', '7d', etc.`, {
                pluginName: 'IdentityPlugin',
                operation: 'calculateExpiration',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide durations using number + unit (s, m, h, d), for example "30m" or "1d".'
            });
        }
        const value = parseInt(match[1], 10);
        const unit = match[2];
        switch (unit) {
            case 's':
                ms = value * 1000;
                break;
            case 'm':
                ms = value * 60 * 1000;
                break;
            case 'h':
                ms = value * 60 * 60 * 1000;
                break;
            case 'd':
                ms = value * 24 * 60 * 60 * 1000;
                break;
            default:
                throw new PluginError(`Invalid duration unit: ${unit}`, {
                    pluginName: 'IdentityPlugin',
                    operation: 'calculateExpiration',
                    statusCode: 400,
                    retriable: false,
                    suggestion: 'Use s, m, h, or d for seconds, minutes, hours, or days respectively.'
                });
        }
    }
    else {
        throw new PluginError('Duration must be a string or number', {
            pluginName: 'IdentityPlugin',
            operation: 'calculateExpiration',
            statusCode: 400,
            retriable: false,
            suggestion: 'Pass durations as milliseconds (number) or a string like "15m".'
        });
    }
    return Date.now() + ms;
}
export function isExpired(expiresAt) {
    if (!expiresAt) {
        return true;
    }
    const timestamp = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : expiresAt;
    return Date.now() > timestamp;
}
export default {
    generateToken,
    generatePasswordResetToken,
    generateEmailVerificationToken,
    generateSessionId,
    generateAPIKey,
    generateNumericCode,
    generateAlphanumericCode,
    generateCSRFToken,
    calculateExpiration,
    isExpired
};
//# sourceMappingURL=token-generator.js.map