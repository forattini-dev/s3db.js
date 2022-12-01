import CryptoJS from "crypto-js";
import Validator from "fastest-validator";

export class CustomValidator extends Validator {
  crypto: any;
  passphrase: string | any;

  constructor(options: any, passphrase?: string) {
    super(options);
    this.passphrase = passphrase;
  }
}

export function ValidatorFactory({ passphrase }: { passphrase?: string }) {
  let options = {
    useNewCustomCheckerFunction: true,

    defaults: {
      object: {
        strict: "remove",
      },
    },
  };

  const validator = new CustomValidator(options, passphrase);

  validator.alias("secret", {
    type: "string",
    custom: (v: any) => {
      if (!validator.passphrase) throw new Error("No passphrase defined.");

      const ciphertext = CryptoJS.AES.encrypt(String(v), validator.passphrase);

      let content = ciphertext.toString();
      content = JSON.stringify(content)

      return content
    },
  });

  return validator;
}
