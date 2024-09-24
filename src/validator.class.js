import { merge } from "lodash-es";
import FastestValidator from "fastest-validator";

import { encrypt } from "./crypto";

async function custom (actual, errors, schema) {
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
      custom: this.autoEncrypt ? custom : undefined,
      messages: {
        string: "The '{field}' field must be a string.",
        stringMin: "This secret '{field}' field length must be at least {expected} long.",
      },
    })

    this.alias('secretAny', { 
      type: "any" ,
      custom: this.autoEncrypt ? custom : undefined,
    })

    this.alias('secretNumber', { 
      type: "number",
      custom: this.autoEncrypt ? custom : undefined,
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
