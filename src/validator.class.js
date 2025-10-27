import { merge, isString } from "lodash-es";
import FastestValidator from "fastest-validator";

import { encrypt } from "./concerns/crypto.js";
import { hashPassword, compactHash } from "./concerns/password-hashing.js";
import tryFn, { tryFnSync } from "./concerns/try-fn.js";
import { ValidationError } from "./errors.js";

async function secretHandler (actual, errors, schema) {
  if (!this.passphrase) {
    errors.push(new ValidationError("Missing configuration for secrets encryption.", {
      actual,
      type: "encryptionKeyMissing",
      suggestion: "Provide a passphrase for secret encryption."
    }));
    return actual;
  }

  const [ok, err, res] = await tryFn(() => encrypt(String(actual), this.passphrase));
  if (ok) return res;
  errors.push(new ValidationError("Problem encrypting secret.", {
    actual,
    type: "encryptionProblem",
    error: err,
    suggestion: "Check the passphrase and input value."
  }));
  return actual;
}

async function passwordHandler (actual, errors, schema) {
  if (!this.bcryptRounds) {
    errors.push(new ValidationError("Missing bcrypt rounds configuration.", {
      actual,
      type: "bcryptRoundsMissing",
      suggestion: "Provide bcryptRounds in database configuration."
    }));
    return actual;
  }

  // Hash password with bcrypt
  const [okHash, errHash, hash] = await tryFn(() => hashPassword(String(actual), this.bcryptRounds));
  if (!okHash) {
    errors.push(new ValidationError("Problem hashing password.", {
      actual,
      type: "passwordHashingProblem",
      error: errHash,
      suggestion: "Check the bcryptRounds configuration and password value."
    }));
    return actual;
  }

  // Compact hash to save space (60 bytes → 53 bytes)
  const [okCompact, errCompact, compacted] = tryFnSync(() => compactHash(hash));
  if (!okCompact) {
    errors.push(new ValidationError("Problem compacting password hash.", {
      actual,
      type: "hashCompactionProblem",
      error: errCompact,
      suggestion: "Bcrypt hash format may be invalid."
    }));
    return hash; // Return uncompacted as fallback
  }

  return compacted;
}

async function jsonHandler (actual, errors, schema) {
  if (isString(actual)) return actual;
  const [ok, err, json] = tryFnSync(() => JSON.stringify(actual));
  if (!ok) throw new ValidationError("Failed to stringify JSON", { original: err, input: actual });
  return json;
}

export class Validator extends FastestValidator {
  constructor({ options, passphrase, bcryptRounds = 10, autoEncrypt = true } = {}) {
    super(merge({}, {
      useNewCustomCheckerFunction: true,

      messages: {
        encryptionKeyMissing: "Missing configuration for secrets encryption.",
        encryptionProblem: "Problem encrypting secret. Actual: {actual}. Error: {error}",
        bcryptRoundsMissing: "Missing bcrypt rounds configuration for password hashing.",
        passwordHashingProblem: "Problem hashing password. Error: {error}",
      },

      defaults: {
        string: {
          trim: true,
        },
        object: {
          strict: "remove",
        },
        number: {
          convert: true,
        }
      },
    }, options))

    this.passphrase = passphrase;
    this.bcryptRounds = bcryptRounds;
    this.autoEncrypt = autoEncrypt;

    this.alias('secret', {
      type: "string",
      custom: this.autoEncrypt ? secretHandler : undefined,
      messages: {
        string: "The '{field}' field must be a string.",
        stringMin: "This secret '{field}' field length must be at least {expected} long.",
      },
    })

    this.alias('secretAny', { 
      type: "any" ,
      custom: this.autoEncrypt ? secretHandler : undefined,
    })

    this.alias('secretNumber', {
      type: "number",
      custom: this.autoEncrypt ? secretHandler : undefined,
    })

    this.alias('password', {
      type: "string",
      custom: this.autoEncrypt ? passwordHandler : undefined,
      messages: {
        string: "The '{field}' field must be a string.",
        stringMin: "This password '{field}' field length must be at least {expected} long.",
      },
    })

    this.alias('json', {
      type: "any",
      custom: this.autoEncrypt ? jsonHandler : undefined,
    })

    // Embedding type - shorthand for arrays of numbers optimized for embeddings
    // Usage: 'embedding:1536' or 'embedding|length:768'
    this.alias('embedding', {
      type: "array",
      items: "number",
      empty: false,
    })
  }
}

export const ValidatorManager = new Proxy(Validator, {
  instance: null,

  construct(target, args) {
    if (!this.instance) this.instance = new target(...args);
    return this.instance;
  }
})

export default Validator;
