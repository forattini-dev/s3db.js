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
  }
}

export const ValidatorManager = Validator;

export default Validator;
