import { cloneDeep, merge } from 'lodash-es';
import { ValidatorManager } from '../validator.class.js';
export class ResourceValidator {
    attributes;
    strictValidation;
    allNestedObjectsOptional;
    passphrase;
    bcryptRounds;
    autoEncrypt;
    autoDecrypt;
    validatorManager;
    validateFn;
    constructor(config = {}) {
        this.attributes = config.attributes || {};
        this.strictValidation = config.strictValidation !== false;
        this.allNestedObjectsOptional = config.allNestedObjectsOptional || false;
        this.passphrase = config.passphrase;
        this.bcryptRounds = config.bcryptRounds;
        this.autoEncrypt = config.autoEncrypt !== false;
        this.autoDecrypt = config.autoDecrypt !== false;
        this.validatorManager = new ValidatorManager({
            autoEncrypt: this.autoEncrypt,
            passphrase: this.passphrase,
            bcryptRounds: this.bcryptRounds
        });
        this.compileValidator();
    }
    compileValidator() {
        const processedAttributes = this.preprocessAttributesForValidation(this.attributes);
        this.validateFn = this.validatorManager.compile(merge({ $$async: true, $$strict: false }, processedAttributes));
    }
    updateSchema(newAttributes) {
        this.attributes = newAttributes;
        this.compileValidator();
    }
    async validate(data, options = {}) {
        const { throwOnError = false, includeId = false, mutateOriginal = false } = options;
        const dataToValidate = mutateOriginal ? data : cloneDeep(data);
        if (!includeId && dataToValidate.id) {
            delete dataToValidate.id;
        }
        const result = {
            isValid: false,
            errors: [],
            data: dataToValidate
        };
        try {
            const check = await this.validateFn(dataToValidate);
            if (check === true) {
                result.isValid = true;
            }
            else {
                result.errors = Array.isArray(check) ? check : [check];
                result.isValid = false;
                if (throwOnError) {
                    const error = new Error('Validation failed');
                    error.validationErrors = result.errors;
                    error.invalidData = data;
                    throw error;
                }
            }
        }
        catch (err) {
            if (!throwOnError) {
                result.errors = [{ message: err.message, error: err }];
                result.isValid = false;
            }
            else {
                throw err;
            }
        }
        return result;
    }
    preprocessAttributesForValidation(attributes) {
        const processed = {};
        for (const [key, value] of Object.entries(attributes)) {
            if (typeof value === 'string') {
                if (value === 'ip4' || value.startsWith('ip4|')) {
                    processed[key] = value.replace(/^ip4/, 'string');
                    continue;
                }
                if (value === 'ip6' || value.startsWith('ip6|')) {
                    processed[key] = value.replace(/^ip6/, 'string');
                    continue;
                }
                if (value === 'buffer' || value.startsWith('buffer|')) {
                    processed[key] = 'any';
                    continue;
                }
                if (value === 'bits' || value.startsWith('bits:') || value.startsWith('bits|')) {
                    processed[key] = 'any';
                    continue;
                }
                if (value === 'money' || value.startsWith('money:') || value.startsWith('money|') ||
                    value === 'crypto' || value.startsWith('crypto:') || value.startsWith('crypto|')) {
                    const rest = value.replace(/^(?:money|crypto)(?::\d+)?/, '');
                    const hasMin = rest.includes('min:');
                    processed[key] = hasMin ? `number${rest}` : `number|min:0${rest}`;
                    continue;
                }
                if (value === 'decimal' || value.startsWith('decimal:') || value.startsWith('decimal|')) {
                    const rest = value.replace(/^decimal(:\d+)?/, '');
                    processed[key] = `number${rest}`;
                    continue;
                }
                if (value.startsWith('geo:lat')) {
                    const rest = value.replace(/^geo:lat(:\d+)?/, '');
                    const hasMin = rest.includes('min:');
                    const hasMax = rest.includes('max:');
                    let validation = 'number';
                    if (!hasMin)
                        validation += '|min:-90';
                    if (!hasMax)
                        validation += '|max:90';
                    processed[key] = validation + rest;
                    continue;
                }
                if (value.startsWith('geo:lon')) {
                    const rest = value.replace(/^geo:lon(:\d+)?/, '');
                    const hasMin = rest.includes('min:');
                    const hasMax = rest.includes('max:');
                    let validation = 'number';
                    if (!hasMin)
                        validation += '|min:-180';
                    if (!hasMax)
                        validation += '|max:180';
                    processed[key] = validation + rest;
                    continue;
                }
                if (value.startsWith('geo:point')) {
                    processed[key] = 'any';
                    continue;
                }
                if (value.startsWith('embedding:')) {
                    const lengthMatch = value.match(/embedding:(\d+)/);
                    if (lengthMatch) {
                        const length = lengthMatch[1];
                        const rest = value.substring(`embedding:${length}`.length);
                        processed[key] = `array|items:number|length:${length}|empty:false${rest}`;
                        continue;
                    }
                }
                if (value.startsWith('embedding|') || value === 'embedding') {
                    processed[key] = value.replace(/^embedding/, 'array|items:number|empty:false');
                    continue;
                }
                if (value.includes('|')) {
                    const parts = value.split('|');
                    const baseType = parts[0];
                    const config = { type: baseType };
                    for (let i = 1; i < parts.length; i++) {
                        const part = parts[i];
                        if (part === 'optional') {
                            config.optional = true;
                        }
                        else if (part === 'required') {
                            // required is default, no action needed
                        }
                        else if (part.includes(':')) {
                            const [modifier, val] = part.split(':');
                            if (val === 'true') {
                                config[modifier] = true;
                            }
                            else if (val === 'false') {
                                config[modifier] = false;
                            }
                            else {
                                const numVal = Number(val);
                                config[modifier] = Number.isNaN(numVal) ? val : numVal;
                            }
                        }
                        else {
                            config[part] = true;
                        }
                    }
                    processed[key] = config;
                    continue;
                }
                processed[key] = value;
            }
            else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                const validatorTypes = [
                    'string', 'number', 'boolean', 'any', 'object', 'array', 'date', 'email', 'url', 'uuid',
                    'enum', 'custom', 'ip4', 'ip6', 'buffer', 'bits', 'money', 'crypto', 'decimal',
                    'geo:lat', 'geo:lon', 'geo:point', 'geo-lat', 'geo-lon', 'geo-point', 'secret', 'password', 'embedding'
                ];
                const objValue = value;
                const typeValue = objValue.type;
                const isValidValidatorType = typeof typeValue === 'string' &&
                    !typeValue.includes('|') &&
                    (validatorTypes.includes(typeValue) || typeValue.startsWith('bits:') || typeValue.startsWith('embedding:'));
                const hasValidatorType = isValidValidatorType && key !== '$$type';
                if (hasValidatorType) {
                    const { __plugin__, __pluginCreated__, ...cleanValue } = objValue;
                    if (cleanValue.type === 'ip4') {
                        processed[key] = { ...cleanValue, type: 'string' };
                    }
                    else if (cleanValue.type === 'ip6') {
                        processed[key] = { ...cleanValue, type: 'string' };
                    }
                    else if (cleanValue.type === 'buffer') {
                        processed[key] = { ...cleanValue, type: 'any' };
                    }
                    else if (cleanValue.type === 'bits' || cleanValue.type?.startsWith('bits:')) {
                        processed[key] = { ...cleanValue, type: 'any' };
                    }
                    else if (cleanValue.type === 'money' || cleanValue.type === 'crypto') {
                        processed[key] = { ...cleanValue, type: 'number', min: cleanValue.min !== undefined ? cleanValue.min : 0 };
                    }
                    else if (cleanValue.type === 'decimal') {
                        processed[key] = { ...cleanValue, type: 'number' };
                    }
                    else if (cleanValue.type === 'geo:lat' || cleanValue.type === 'geo-lat') {
                        processed[key] = {
                            ...cleanValue,
                            type: 'number',
                            min: cleanValue.min !== undefined ? cleanValue.min : -90,
                            max: cleanValue.max !== undefined ? cleanValue.max : 90
                        };
                    }
                    else if (cleanValue.type === 'geo:lon' || cleanValue.type === 'geo-lon') {
                        processed[key] = {
                            ...cleanValue,
                            type: 'number',
                            min: cleanValue.min !== undefined ? cleanValue.min : -180,
                            max: cleanValue.max !== undefined ? cleanValue.max : 180
                        };
                    }
                    else if (cleanValue.type === 'geo:point' || cleanValue.type === 'geo-point') {
                        processed[key] = { ...cleanValue, type: 'any' };
                    }
                    else if (cleanValue.type === 'object' && cleanValue.properties) {
                        processed[key] = {
                            ...cleanValue,
                            properties: this.preprocessAttributesForValidation(cleanValue.properties)
                        };
                    }
                    else if (cleanValue.type === 'object' && cleanValue.props) {
                        processed[key] = {
                            ...cleanValue,
                            props: this.preprocessAttributesForValidation(cleanValue.props)
                        };
                    }
                    else {
                        processed[key] = cleanValue;
                    }
                }
                else {
                    const nestedObj = value;
                    const isExplicitRequired = nestedObj.$$type && nestedObj.$$type.includes('required');
                    const isExplicitOptional = nestedObj.$$type && nestedObj.$$type.includes('optional');
                    const objectConfig = {
                        type: 'object',
                        props: this.preprocessAttributesForValidation(nestedObj),
                        strict: false
                    };
                    if (isExplicitRequired) {
                        // nothing
                    }
                    else if (isExplicitOptional || this.allNestedObjectsOptional) {
                        objectConfig.optional = true;
                    }
                    processed[key] = objectConfig;
                }
            }
            else {
                processed[key] = value;
            }
        }
        return processed;
    }
    applyDefaults(data) {
        const out = { ...data };
        for (const [key, def] of Object.entries(this.attributes)) {
            if (out[key] === undefined) {
                if (typeof def === 'string' && def.includes('default:')) {
                    const match = def.match(/default:([^|]+)/);
                    if (match) {
                        let val = match[1];
                        if (def.includes('boolean'))
                            val = val === 'true';
                        else if (def.includes('number'))
                            val = Number(val);
                        out[key] = val;
                    }
                }
            }
        }
        return out;
    }
}
export default ResourceValidator;
//# sourceMappingURL=resource-validator.class.js.map