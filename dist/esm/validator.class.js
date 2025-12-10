import { merge, isString } from 'lodash-es';
import * as FastestValidatorModule from 'fastest-validator';
import { encrypt } from './concerns/crypto.js';
import { hashPasswordSync, compactHash } from './concerns/password-hashing.js';
import tryFn, { tryFnSync } from './concerns/try-fn.js';
import { ValidationError } from './errors.js';
const FastestValidator = FastestValidatorModule.default;
async function secretHandler(actual, errors, _schema, field) {
    if (!this.passphrase) {
        errors.push(new ValidationError('Missing configuration for secrets encryption.', {
            actual,
            field,
            type: 'encryptionKeyMissing',
            suggestion: 'Provide a passphrase for secret encryption.'
        }));
        return actual;
    }
    const [ok, err, res] = await tryFn(() => encrypt(String(actual), this.passphrase));
    if (ok)
        return res;
    errors.push(new ValidationError('Problem encrypting secret.', {
        actual,
        field,
        type: 'encryptionProblem',
        error: err,
        suggestion: 'Check the passphrase and input value.'
    }));
    return actual;
}
function passwordHandler(actual, errors, _schema, field) {
    if (!this.bcryptRounds) {
        errors.push(new ValidationError('Missing bcrypt rounds configuration.', {
            actual,
            field,
            type: 'bcryptRoundsMissing',
            suggestion: 'Provide bcryptRounds in database configuration.'
        }));
        return actual;
    }
    const [okHash, errHash, hash] = tryFnSync(() => hashPasswordSync(String(actual), this.bcryptRounds));
    if (!okHash) {
        errors.push(new ValidationError('Problem hashing password.', {
            actual,
            field,
            type: 'passwordHashingProblem',
            error: errHash,
            suggestion: 'Check the bcryptRounds configuration and password value.'
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
            suggestion: 'Bcrypt hash format may be invalid.'
        }));
        return hash;
    }
    return compacted;
}
function jsonHandler(actual, errors, _schema, field) {
    if (isString(actual))
        return actual;
    const [ok, err, json] = tryFnSync(() => JSON.stringify(actual));
    if (!ok)
        throw new ValidationError('Failed to stringify JSON', { original: err, input: actual, field });
    return json;
}
export class Validator extends FastestValidator {
    passphrase;
    bcryptRounds;
    autoEncrypt;
    autoHash;
    constructor({ options, passphrase, bcryptRounds = 10, autoEncrypt = true, autoHash = true } = {}) {
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
                }
            },
        }, options));
        this.passphrase = passphrase;
        this.bcryptRounds = bcryptRounds;
        this.autoEncrypt = autoEncrypt;
        this.autoHash = autoHash;
        this.alias('secret', {
            type: 'string',
            custom: this.autoEncrypt ? secretHandler : undefined,
            messages: {
                string: "The '{field}' field must be a string.",
                stringMin: "This secret '{field}' field length must be at least {expected} long.",
            },
        });
        this.alias('secretAny', {
            type: 'any',
            custom: this.autoEncrypt ? secretHandler : undefined,
        });
        this.alias('secretNumber', {
            type: 'number',
            custom: this.autoEncrypt ? secretHandler : undefined,
        });
        this.alias('password', {
            type: 'string',
            custom: this.autoHash ? passwordHandler : undefined,
            messages: {
                string: "The '{field}' field must be a string.",
                stringMin: "This password '{field}' field length must be at least {expected} long.",
            },
        });
        this.alias('json', {
            type: 'any',
            custom: this.autoEncrypt ? jsonHandler : undefined,
        });
        this.alias('embedding', {
            type: 'array',
            items: 'number',
            empty: false,
        });
    }
}
export const ValidatorManager = Validator;
export default Validator;
//# sourceMappingURL=validator.class.js.map