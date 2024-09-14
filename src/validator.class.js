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
  constructor({ options, passphrase } = {}) {
    super(merge({}, {
      useNewCustomCheckerFunction: true,

      messages: {
        encryptionKeyMissing: "Missing configuration for secrets encryption.",
        encryptionProblem: "Problem encrypting secret. Actual: {actual}. Error: {error}",
      },

      defaults: {
        object: {
          strict: "remove",
        },
      },
    }, options))

    this.passphrase = passphrase;

    this.alias('secret', {
      custom,
      type: "string",

      messages: {
        string: "The '{field}' field must be a string.",
        stringMin: "This secret '{field}' field length must be at least {expected} long.",
      },
    })

    this.alias('secretAny', { custom, type: "any" })
    this.alias('secretNumber', { custom, type: "number" })
  }
}

export default Validator;
