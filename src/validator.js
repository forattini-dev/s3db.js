import CryptoJS from "crypto-js";
import Validator from "fastest-validator";

export class SecretValidator extends Validator {
  constructor(options, passphrase) {
    super(options);
    this.passphrase = passphrase;
  }
}

export function ValidatorFactory({ passphrase }) {
  let options = {
    useNewCustomCheckerFunction: true,
    defaults: {
      object: {
        strict: "remove",
      },
    },
  };

  const validator = new SecretValidator(options, passphrase);

  validator.alias("secret", {
    type: "string",
    custom: (v) => {
      if (!validator.passphrase) throw new Error("No passphrase defined.");
      return CryptoJS.AES.encrypt(String(v), validator.passphrase).toString();
    },
  });

  return validator;
}
