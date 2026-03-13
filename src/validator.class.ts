import { merge, isString } from 'lodash-es';
import * as FastestValidatorModule from 'fastest-validator';
import type { ValidationRuleObject, ValidatorConstructorOptions } from 'fastest-validator';

import { decrypt, encrypt } from './concerns/crypto.js';
import {
  compactHash,
  hashPassword,
  isPasswordHash,
  type PasswordAlgorithm,
  type SecurityConfig
} from './concerns/password-hashing.js';
import tryFn, { tryFnSync } from './concerns/try-fn.js';
import { ValidationError } from './errors.js';

const FastestValidator = FastestValidatorModule.default as unknown as new (opts?: ValidatorConstructorOptions) => FastestValidatorModule.default;

export interface ValidatorOptions {
  options?: Record<string, unknown>;
  security?: SecurityConfig;
  autoEncrypt?: boolean;
  autoHash?: boolean;
}

interface ValidatorContext {
  security: SecurityConfig;
  autoEncrypt?: boolean;
  autoHash?: boolean;
}

type ValidationErrors = Array<Error | Record<string, unknown>>;

async function secretHandler(
  this: ValidatorContext,
  actual: unknown,
  errors: ValidationErrors,
  _schema: unknown,
  field: string
): Promise<unknown> {
  const secretValue = String(actual);

  if (this.security?.passphrase) {
    const [okDecrypt] = await tryFn(() => decrypt(secretValue, this.security.passphrase!));
    if (okDecrypt) {
      return actual;
    }
  }

  if (!this.security?.passphrase) {
    errors.push(new ValidationError('Missing configuration for secrets encryption.', {
      actual,
      field,
      type: 'encryptionKeyMissing',
      suggestion: 'Provide a passphrase for secret encryption.'
    }));
    return actual;
  }

  const [ok, err, res] = await tryFn(() => encrypt(secretValue, this.security.passphrase!));
  if (ok) return res;
  errors.push(new ValidationError('Problem encrypting secret.', {
    actual,
    field,
    type: 'encryptionProblem',
    error: err,
    suggestion: 'Check the passphrase and input value.'
  }));
  return actual;
}

function createPasswordHandler(algorithm: PasswordAlgorithm = 'bcrypt') {
  return async function passwordHandler(
    this: ValidatorContext,
    actual: unknown,
    errors: ValidationErrors,
    _schema: unknown,
    field: string
  ): Promise<unknown> {
    const strValue = String(actual);

    if (isPasswordHash(strValue)) {
      return actual;
    }

    const [okHash, errHash, hash] = await tryFn(() => hashPassword(strValue, {
      rounds: this.security?.bcrypt?.rounds ?? 12,
      algorithm,
      pepper: this.security?.pepper,
      argon2: this.security?.argon2,
    }));
    if (!okHash) {
      errors.push(new ValidationError('Problem hashing password.', {
        actual,
        field,
        type: 'passwordHashingProblem',
        error: errHash,
        suggestion: `Check the password value and ${algorithm} configuration.`
      }));
      return actual;
    }

    const [okCompact, errCompact, compacted] = tryFnSync(() => compactHash(hash));
    if (!okCompact) {
      errors.push(new ValidationError('Problem compacting password hash.', {
        actual,
        field,
        type: 'hashCompactionProblem',
        error: errCompact,
        suggestion: 'Hash format may be invalid.'
      }));
      return hash;
    }

    return compacted;
  };
}

function jsonHandler(
  this: ValidatorContext,
  actual: unknown,
  errors: ValidationErrors,
  _schema: unknown,
  field: string
): unknown {
  if (isString(actual)) return actual;
  const [ok, err, json] = tryFnSync(() => JSON.stringify(actual));
  if (!ok) throw new ValidationError('Failed to stringify JSON', { original: err, input: actual, field });
  return json;
}

export class Validator extends FastestValidator {
  security: SecurityConfig;
  autoEncrypt: boolean;
  autoHash: boolean;

  constructor({
    options,
    security = {},
    autoEncrypt = true,
    autoHash = true
  }: ValidatorOptions = {}) {
    super(merge({}, {
      useNewCustomCheckerFunction: true,

      messages: {
        encryptionKeyMissing: 'Missing configuration for secrets encryption.',
        encryptionProblem: 'Problem encrypting secret. Actual: {actual}. Error: {error}',
        bcryptRoundsMissing: 'Missing bcrypt rounds configuration for password hashing.',
        passwordHashingProblem: 'Problem hashing password. Error: {error}',
      },

      defaults: {
        string: {
          trim: true,
        },
        object: {
          strict: 'remove',
        },
        number: {
          convert: true,
        },
        boolean: {
          convert: true,
        }
      },
    }, options));

    this.security = security;
    this.autoEncrypt = autoEncrypt;
    this.autoHash = autoHash;

    this.alias('secret', {
      type: 'string',
      custom: this.autoEncrypt ? secretHandler : undefined,
      messages: {
        string: "The '{field}' field must be a string.",
        stringMin: "This secret '{field}' field length must be at least {expected} long.",
      },
    } as ValidationRuleObject);

    this.alias('secretAny', {
      type: 'any',
      custom: this.autoEncrypt ? secretHandler : undefined,
    } as ValidationRuleObject);

    this.alias('secretNumber', {
      type: 'number',
      custom: this.autoEncrypt ? secretHandler : undefined,
    } as ValidationRuleObject);

    const passwordMessages = {
      string: "The '{field}' field must be a string.",
      stringMin: "This password '{field}' field length must be at least {expected} long.",
    };

    this.alias('password', {
      type: 'string',
      custom: this.autoHash ? createPasswordHandler('bcrypt') : undefined,
      messages: passwordMessages,
    } as ValidationRuleObject);

    this.alias('password:bcrypt', {
      type: 'string',
      custom: this.autoHash ? createPasswordHandler('bcrypt') : undefined,
      messages: passwordMessages,
    } as ValidationRuleObject);

    this.alias('password:argon2id', {
      type: 'string',
      custom: this.autoHash ? createPasswordHandler('argon2id') : undefined,
      messages: passwordMessages,
    } as ValidationRuleObject);

    this.alias('json', {
      type: 'any',
      custom: this.autoEncrypt ? jsonHandler : undefined,
    } as ValidationRuleObject);

    this.alias('embedding', {
      type: 'array',
      items: 'number',
      empty: false,
    } as ValidationRuleObject);

    this.alias('datetime', {
      type: 'any',
      custom(value: unknown, errors: ValidationErrors, _schema: unknown, field: string): unknown {
        if (value === null || value === undefined) return value;
        if (value instanceof Date) {
          if (!Number.isFinite(value.getTime())) {
            errors.push({ type: 'datetime', field, message: `The '${field}' field must be a valid datetime.`, actual: value });
            return value;
          }
          return value.toISOString();
        }
        if (typeof value === 'number') {
          const d = new Date(value);
          if (!Number.isFinite(d.getTime())) {
            errors.push({ type: 'datetime', field, message: `The '${field}' field must be a valid datetime.`, actual: value });
            return value;
          }
          return d.toISOString();
        }
        if (typeof value === 'string') {
          const d = new Date(value);
          if (!Number.isFinite(d.getTime())) {
            errors.push({ type: 'datetime', field, message: `The '${field}' field must be a valid datetime.`, actual: value });
            return value;
          }
          return d.toISOString();
        }
        errors.push({ type: 'datetime', field, message: `The '${field}' field must be a valid datetime.`, actual: value });
        return value;
      },
    } as unknown as ValidationRuleObject);

    this.alias('dateonly', {
      type: 'any',
      custom(value: unknown, errors: ValidationErrors, _schema: unknown, field: string): unknown {
        if (value === null || value === undefined) return value;
        if (value instanceof Date) {
          if (!Number.isFinite(value.getTime())) {
            errors.push({ type: 'date', field, message: `The '${field}' field must be a valid date.`, actual: value });
            return value;
          }
          return value.toISOString().slice(0, 10);
        }
        if (typeof value === 'number') {
          const d = new Date(value);
          if (!Number.isFinite(d.getTime())) {
            errors.push({ type: 'date', field, message: `The '${field}' field must be a valid date.`, actual: value });
            return value;
          }
          return d.toISOString().slice(0, 10);
        }
        if (typeof value === 'string') {
          const d = new Date(value.includes('T') ? value : value + 'T00:00:00.000Z');
          if (!Number.isFinite(d.getTime())) {
            errors.push({ type: 'date', field, message: `The '${field}' field must be a valid date.`, actual: value });
            return value;
          }
          return d.toISOString().slice(0, 10);
        }
        errors.push({ type: 'date', field, message: `The '${field}' field must be a valid date.`, actual: value });
        return value;
      },
    } as unknown as ValidationRuleObject);

    this.alias('timeonly', {
      type: 'any',
      custom(value: unknown, errors: ValidationErrors, _schema: unknown, field: string): unknown {
        if (value === null || value === undefined) return value;
        if (value instanceof Date) {
          if (!Number.isFinite(value.getTime())) {
            errors.push({ type: 'timeonly', field, message: `The '${field}' field must be a valid time.`, actual: value });
            return value;
          }
          return value.toISOString().slice(11, 23);
        }
        if (typeof value === 'string') {
          const timeMatch = value.match(/^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
          if (timeMatch) {
            const h = parseInt(timeMatch[1]!, 10);
            const m = parseInt(timeMatch[2]!, 10);
            const s = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
            const ms = timeMatch[4] ? parseInt(timeMatch[4].padEnd(3, '0'), 10) : 0;
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59 && s >= 0 && s <= 59 && ms >= 0 && ms <= 999) {
              return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
            }
          }
          if (value.includes('T')) {
            const d = new Date(value);
            if (Number.isFinite(d.getTime())) {
              return d.toISOString().slice(11, 23);
            }
          }
          errors.push({ type: 'timeonly', field, message: `The '${field}' field must be a valid time (HH:mm, HH:mm:ss, or HH:mm:ss.SSS).`, actual: value });
          return value;
        }
        errors.push({ type: 'timeonly', field, message: `The '${field}' field must be a valid time.`, actual: value });
        return value;
      },
    } as unknown as ValidationRuleObject);

    this.alias('s3db-mac', {
      type: 'any',
      custom(value: unknown, errors: ValidationErrors, _schema: unknown, field: string): unknown {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') {
          const cleaned = value.replace(/[:\-\.]/g, '').toLowerCase();
          if (/^[0-9a-f]{12}$/.test(cleaned)) {
            return cleaned.match(/.{2}/g)!.join(':');
          }
        }
        errors.push({ type: 'mac', field, message: `The '${field}' field must be a valid MAC address (e.g., AA:BB:CC:DD:EE:FF).`, actual: value });
        return value;
      },
    } as unknown as ValidationRuleObject);

    this.alias('cidr', {
      type: 'any',
      custom(value: unknown, errors: ValidationErrors, _schema: unknown, field: string): unknown {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') {
          const match = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
          if (match) {
            const octets = [parseInt(match[1]!, 10), parseInt(match[2]!, 10), parseInt(match[3]!, 10), parseInt(match[4]!, 10)];
            const prefix = parseInt(match[5]!, 10);
            if (octets.every(o => o >= 0 && o <= 255) && prefix >= 0 && prefix <= 32) {
              return `${octets.join('.')}/${prefix}`;
            }
          }
        }
        errors.push({ type: 'cidr', field, message: `The '${field}' field must be a valid CIDR notation (e.g., 192.168.1.0/24).`, actual: value });
        return value;
      },
    } as unknown as ValidationRuleObject);

    this.alias('semver', {
      type: 'any',
      custom(value: unknown, errors: ValidationErrors, _schema: unknown, field: string): unknown {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') {
          const cleaned = value.startsWith('v') ? value.slice(1) : value;
          const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)$/);
          if (match) {
            return `${parseInt(match[1]!, 10)}.${parseInt(match[2]!, 10)}.${parseInt(match[3]!, 10)}`;
          }
        }
        errors.push({ type: 'semver', field, message: `The '${field}' field must be a valid semantic version (e.g., 1.2.3).`, actual: value });
        return value;
      },
    } as unknown as ValidationRuleObject);

    this.alias('phone', {
      type: 'any',
      custom(value: unknown, errors: ValidationErrors, _schema: unknown, field: string): unknown {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') {
          const digits = value.replace(/[\s\-\(\)\.]/g, '');
          const withPlus = digits.startsWith('+') ? digits : '+' + digits;
          const numPart = withPlus.slice(1);
          if (/^\d{7,15}$/.test(numPart)) {
            return withPlus;
          }
        }
        errors.push({ type: 'phone', field, message: `The '${field}' field must be a valid phone number in E.164 format (e.g., +5511999999999).`, actual: value });
        return value;
      },
    } as unknown as ValidationRuleObject);

    this.alias('color', {
      type: 'any',
      custom(value: unknown, errors: ValidationErrors, _schema: unknown, field: string): unknown {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') {
          let hex = value.startsWith('#') ? value.slice(1) : value;
          hex = hex.toLowerCase();
          if (/^[0-9a-f]{3}$/.test(hex)) {
            hex = hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!;
          }
          if (/^[0-9a-f]{6}$/.test(hex)) {
            return '#' + hex;
          }
        }
        errors.push({ type: 'color', field, message: `The '${field}' field must be a valid hex color (e.g., #FF5733 or #F57).`, actual: value });
        return value;
      },
    } as unknown as ValidationRuleObject);

    this.alias('duration', {
      type: 'any',
      custom(value: unknown, errors: ValidationErrors, _schema: unknown, field: string): unknown {
        if (value === null || value === undefined) return value;
        if (typeof value === 'number') {
          if (value >= 0 && Number.isFinite(value)) return value;
          errors.push({ type: 'duration', field, message: `The '${field}' field must be a non-negative duration.`, actual: value });
          return value;
        }
        if (typeof value === 'string') {
          const iso = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
          if (iso && value !== 'P' && value !== 'PT') {
            const ms = (parseInt(iso[1] || '0', 10) * 86400 + parseInt(iso[2] || '0', 10) * 3600 + parseInt(iso[3] || '0', 10) * 60 + parseFloat(iso[4] || '0')) * 1000;
            return Math.round(ms);
          }
          let ms = 0; let matched = false;
          const s = value.toLowerCase();
          const msM = s.match(/(\d+)ms/); if (msM) { ms += parseInt(msM[1]!, 10); matched = true; }
          const clean = s.replace(/\d+ms/g, '');
          const dM = clean.match(/(\d+(?:\.\d+)?)d/); if (dM) { ms += parseFloat(dM[1]!) * 86400000; matched = true; }
          const hM = clean.match(/(\d+(?:\.\d+)?)h/); if (hM) { ms += parseFloat(hM[1]!) * 3600000; matched = true; }
          const mM = clean.match(/(\d+(?:\.\d+)?)m/); if (mM) { ms += parseFloat(mM[1]!) * 60000; matched = true; }
          const sM = clean.match(/(\d+(?:\.\d+)?)s/); if (sM) { ms += parseFloat(sM[1]!) * 1000; matched = true; }
          if (matched) return Math.round(ms);
        }
        errors.push({ type: 'duration', field, message: `The '${field}' field must be a valid duration (e.g., PT1H30M, 1h30m, 90m).`, actual: value });
        return value;
      },
    } as unknown as ValidationRuleObject);

    this.alias('cron', {
      type: 'any',
      custom(value: unknown, errors: ValidationErrors, _schema: unknown, field: string): unknown {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') {
          const parts = value.trim().split(/\s+/);
          if (parts.length === 5) {
            const valid = parts.every(p => /^(\*|(\d+(-\d+)?(\/\d+)?)(,(\d+(-\d+)?(\/\d+)?))*|\*\/\d+)$/.test(p!));
            if (valid) return parts.join(' ');
          }
        }
        errors.push({ type: 'cron', field, message: `The '${field}' field must be a valid 5-field cron expression (e.g., 0 */5 * * *).`, actual: value });
        return value;
      },
    } as unknown as ValidationRuleObject);

    this.alias('locale', {
      type: 'any',
      custom(value: unknown, errors: ValidationErrors, _schema: unknown, field: string): unknown {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') {
          const match = value.match(/^([a-zA-Z]{2})[-_]([a-zA-Z]{2})$/);
          if (match) return match[1]!.toLowerCase() + '-' + match[2]!.toUpperCase();
          if (/^[a-zA-Z]{2}$/.test(value)) return value.toLowerCase();
        }
        errors.push({ type: 'locale', field, message: `The '${field}' field must be a valid locale (e.g., pt-BR, en-US, or just en).`, actual: value });
        return value;
      },
    } as unknown as ValidationRuleObject);

    this.alias('s3db-currency', {
      type: 'any',
      custom(value: unknown, errors: ValidationErrors, _schema: unknown, field: string): unknown {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' && /^[a-zA-Z]{3}$/.test(value)) {
          return value.toUpperCase();
        }
        errors.push({ type: 'currency', field, message: `The '${field}' field must be a valid 3-letter currency code (e.g., USD, BRL, EUR).`, actual: value });
        return value;
      },
    } as unknown as ValidationRuleObject);

    this.alias('country', {
      type: 'any',
      custom(value: unknown, errors: ValidationErrors, _schema: unknown, field: string): unknown {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' && /^[a-zA-Z]{2}$/.test(value)) {
          return value.toUpperCase();
        }
        errors.push({ type: 'country', field, message: `The '${field}' field must be a valid 2-letter country code (e.g., BR, US, DE).`, actual: value });
        return value;
      },
    } as unknown as ValidationRuleObject);

    this.alias('ean', {
      type: 'any',
      custom(value: unknown, errors: ValidationErrors, _schema: unknown, field: string): unknown {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' && /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(value)) {
          return value;
        }
        if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
          const s = value.toString();
          if (s.length <= 14) return s.padStart(13, '0');
        }
        errors.push({ type: 'ean', field, message: `The '${field}' field must be a valid barcode (EAN-8, UPC-A 12, EAN-13, or GTIN-14 digits).`, actual: value });
        return value;
      },
    } as unknown as ValidationRuleObject);
  }
}

export const ValidatorManager = Validator;

export default Validator;
