import * as FastestValidatorModule from 'fastest-validator';
import type { ValidatorConstructorOptions } from 'fastest-validator';
declare const FastestValidator: new (opts?: ValidatorConstructorOptions) => FastestValidatorModule.default;
export interface ValidatorOptions {
    options?: Record<string, unknown>;
    passphrase?: string;
    bcryptRounds?: number;
    autoEncrypt?: boolean;
    autoHash?: boolean;
}
export declare class Validator extends FastestValidator {
    passphrase?: string;
    bcryptRounds: number;
    autoEncrypt: boolean;
    autoHash: boolean;
    constructor({ options, passphrase, bcryptRounds, autoEncrypt, autoHash }?: ValidatorOptions);
}
export declare const ValidatorManager: typeof Validator;
export default Validator;
//# sourceMappingURL=validator.class.d.ts.map