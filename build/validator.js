"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidatorFactory = exports.CustomValidator = void 0;
const crypto_js_1 = __importDefault(require("crypto-js"));
const fastest_validator_1 = __importDefault(require("fastest-validator"));
class CustomValidator extends fastest_validator_1.default {
    constructor(options, passphrase) {
        super(options);
        this.crypto = crypto_js_1.default;
        this.passphrase = passphrase;
    }
}
exports.CustomValidator = CustomValidator;
function ValidatorFactory({ passphrase }) {
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
        custom: (v) => {
            if (!validator.passphrase)
                throw new Error('No passphrase defined.');
            return validator.crypto.AES.encrypt(v, validator.passphrase).toString();
        }
    });
    return validator;
}
exports.ValidatorFactory = ValidatorFactory;
