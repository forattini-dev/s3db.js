import Crypto from "crypto-js";
import Validator from "fastest-validator";

export class CustomValidator extends Validator {
  crypto: typeof Crypto;
  passphrase: string | any;

  constructor(options: any, passphrase?: string) {
    super(options);

    this.crypto = Crypto;
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
    type: 'string',
    custom: (v: any) => {
      if (!validator.passphrase) throw new Error('No passphrase defined.')
      return validator.crypto.AES.encrypt(v, validator.passphrase).toString()
    }
  });

  return validator;
}
