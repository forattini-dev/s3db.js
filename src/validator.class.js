import { merge, isString } from "lodash-es";
import FastestValidator from "fastest-validator";

import { encrypt } from "./concerns/crypto.js";
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

async function jsonHandler (actual, errors, schema) {
  if (isString(actual)) return actual;
  const [ok, err, json] = tryFnSync(() => JSON.stringify(actual));
  if (!ok) throw new ValidationError("Failed to stringify JSON", { original: err, input: actual });
  return json;
}

export class Validator extends FastestValidator {
  constructor({ options, passphrase, autoEncrypt = true } = {}) {
    super(merge({}, {
      useNewCustomCheckerFunction: true,

      messages: {
        encryptionKeyMissing: "Missing configuration for secrets encryption.",
        encryptionProblem: "Problem encrypting secret. Actual: {actual}. Error: {error}",
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
