import { merge, isString } from "lodash-es";
import FastestValidator from "fastest-validator";

import { encrypt } from "./crypto.js";

async function secretHandler (actual, errors, schema) {
  if (!this.passphrase) {
    errors.push({ actual, type: "encryptionKeyMissing" })
    return actual
  }

  try {
    const res = await encrypt(String(actual), this.passphrase);
    return res;
  } catch (error) {
    errors.push({ actual, type: "encryptionProblem", error })
  }

  return actual
}

async function jsonHandler (actual, errors, schema) {
  if (isString(actual)) return actual
  return JSON.stringify(actual)
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
