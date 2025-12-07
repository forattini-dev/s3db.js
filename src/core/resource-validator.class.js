import { cloneDeep, merge } from "lodash-es";
import { ValidatorManager } from "../validator.class.js";
import { ValidationError } from "../errors.js";

export class ResourceValidator {
    /**
     * Create a new ResourceValidator instance
     * @param {Object} config - Validator configuration
     * @param {Object} config.attributes - Resource attributes schema
     * @param {boolean} [config.strictValidation=true] - Enable strict validation
     * @param {boolean} [config.allNestedObjectsOptional=false] - Make nested objects optional
     * @param {string} [config.passphrase] - Encryption passphrase
     * @param {number} [config.bcryptRounds] - Bcrypt rounds
     * @param {boolean} [config.autoEncrypt=true] - Auto encrypt secrets
     * @param {boolean} [config.autoDecrypt=true] - Auto decrypt secrets
     */
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

    /**
     * Compile the validator with current attributes
     */
    compileValidator() {
        const processedAttributes = this.preprocessAttributesForValidation(this.attributes);

        this.validateFn = this.validatorManager.compile(merge(
            { $$async: true, $$strict: false },
            processedAttributes,
        ));
    }

    /**
     * Update the validator schema
     * @param {Object} newAttributes - New attributes schema
     */
    updateSchema(newAttributes) {
        this.attributes = newAttributes;
        this.compileValidator();
    }

    /**
     * Validate data against the schema
     * @param {Object} data - Data to validate
     * @param {Object} options - Validation options
     * @param {boolean} [options.throwOnError=false] - Throw error if validation fails
     * @param {boolean} [options.includeId=false] - Include ID validation
     * @param {boolean} [options.mutateOriginal=false] - Allow mutation of original data
     * @returns {Promise<{isValid: boolean, errors: Array, data: Object}>} Validation result
     */
    async validate(data, options = {}) {
        const {
            throwOnError = false,
            includeId = false,
            mutateOriginal = false
        } = options;

        // Clone data to avoid mutation (unless mutateOriginal is true)
        const dataToValidate = mutateOriginal ? data : cloneDeep(data);

        // If includeId is false, remove id from validation
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
            } else {
                result.errors = Array.isArray(check) ? check : [check];
                result.isValid = false;

                if (throwOnError) {
                    const error = new Error('Validation failed');
                    error.validationErrors = result.errors;
                    error.invalidData = data;
                    throw error;
                }
            }
        } catch (err) {
            // If validator threw, and we're not in throwOnError mode, catch and return result
            if (!throwOnError) {
                result.errors = [{ message: err.message, error: err }];
                result.isValid = false;
            } else {
                throw err;
            }
        }

        return result;
    }

    /**
     * Preprocess attributes to convert nested objects into validator-compatible format
     * @param {Object} attributes - Original attributes
     * @returns {Object} Processed attributes for validator
     */
    preprocessAttributesForValidation(attributes) {
        const processed = {};

        for (const [key, value] of Object.entries(attributes)) {
            if (typeof value === 'string') {
                // Expand ip4 shorthand to string type with custom validation
                if (value === 'ip4' || value.startsWith('ip4|')) {
                    processed[key] = value.replace(/^ip4/, 'string');
                    continue;
                }
                // Expand ip6 shorthand to string type with custom validation
                if (value === 'ip6' || value.startsWith('ip6|')) {
                    processed[key] = value.replace(/^ip6/, 'string');
                    continue;
                }
                // Expand buffer shorthand to any type (validated by hooks)
                if (value === 'buffer' || value.startsWith('buffer|')) {
                    processed[key] = 'any';
                    continue;
                }
                // Expand bits:N shorthand to any type (validated by hooks)
                if (value === 'bits' || value.startsWith('bits:') || value.startsWith('bits|')) {
                    processed[key] = 'any';
                    continue;
                }
                // Expand money/crypto shorthand to number type with min validation
                if (value === 'money' || value.startsWith('money:') || value.startsWith('money|') ||
                    value === 'crypto' || value.startsWith('crypto:') || value.startsWith('crypto|')) {
                    // Extract any modifiers after money:N or crypto:N
                    const rest = value.replace(/^(?:money|crypto)(?::\d+)?/, '');
                    // Money must be non-negative
                    const hasMin = rest.includes('min:');
                    processed[key] = hasMin ? `number${rest}` : `number|min:0${rest}`;
                    continue;
                }
                // Expand decimal shorthand to number type
                if (value === 'decimal' || value.startsWith('decimal:') || value.startsWith('decimal|')) {
                    // Extract any modifiers after decimal:PRECISION
                    const rest = value.replace(/^decimal(:\d+)?/, '');
                    processed[key] = `number${rest}`;
                    continue;
                }
                // Expand geo:lat shorthand to number type with range validation
                if (value.startsWith('geo:lat')) {
                    // Extract any modifiers after geo:lat:PRECISION
                    const rest = value.replace(/^geo:lat(:\d+)?/, '');
                    // Latitude range: -90 to 90
                    const hasMin = rest.includes('min:');
                    const hasMax = rest.includes('max:');
                    let validation = 'number';
                    if (!hasMin) validation += '|min:-90';
                    if (!hasMax) validation += '|max:90';
                    processed[key] = validation + rest;
                    continue;
                }
                // Expand geo:lon shorthand to number type with range validation
                if (value.startsWith('geo:lon')) {
                    // Extract any modifiers after geo:lon:PRECISION
                    const rest = value.replace(/^geo:lon(:\d+)?/, '');
                    // Longitude range: -180 to 180
                    const hasMin = rest.includes('min:');
                    const hasMax = rest.includes('max:');
                    let validation = 'number';
                    if (!hasMin) validation += '|min:-180';
                    if (!hasMax) validation += '|max:180';
                    processed[key] = validation + rest;
                    continue;
                }
                // Expand geo:point shorthand to object with lat/lon
                if (value.startsWith('geo:point')) {
                    // geo:point is an object or array with lat/lon
                    // For simplicity, allow it as any type (will be validated in hooks)
                    processed[key] = 'any';
                    continue;
                }
                // Expand embedding:XXX shorthand to array|items:number|length:XXX
                if (value.startsWith('embedding:')) {
                    const lengthMatch = value.match(/embedding:(\d+)/);
                    if (lengthMatch) {
                        const length = lengthMatch[1];
                        // Extract any additional modifiers after the length
                        const rest = value.substring(`embedding:${length}`.length);
                        processed[key] = `array|items:number|length:${length}|empty:false${rest}`;
                        continue;
                    }
                }
                // Expand embedding|... to array|items:number|...
                if (value.startsWith('embedding|') || value === 'embedding') {
                    processed[key] = value.replace(/^embedding/, 'array|items:number|empty:false');
                    continue;
                }
                // Convert s3db.js pipe notation to fastest-validator object format
                // e.g., 'string|optional' -> { type: 'string', optional: true }
                // e.g., 'number|min:0|max:100' -> { type: 'number', min: 0, max: 100 }
                if (value.includes('|')) {
                    const parts = value.split('|');
                    const baseType = parts[0];
                    const config = { type: baseType };

                    for (let i = 1; i < parts.length; i++) {
                        const part = parts[i];
                        if (part === 'optional') {
                            config.optional = true;
                        } else if (part === 'required') {
                            // required is default, no action needed
                        } else if (part.includes(':')) {
                            const [modifier, val] = part.split(':');
                            // Parse numeric values or booleans
                            if (val === 'true') {
                                config[modifier] = true;
                            } else if (val === 'false') {
                                config[modifier] = false;
                            } else {
                                const numVal = Number(val);
                                config[modifier] = Number.isNaN(numVal) ? val : numVal;
                            }
                        } else {
                            // Boolean modifier like 'empty'
                            config[part] = true;
                        }
                    }
                    processed[key] = config;
                    continue;
                }
                processed[key] = value;
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Check if this is a validator type definition (has 'type' property that is a valid type)
                // vs a nested object structure that happens to have a field named "type"
                // Valid validator types don't contain '|' - that's s3db shorthand notation for data fields
                const validatorTypes = ['string', 'number', 'boolean', 'any', 'object', 'array', 'date', 'email', 'url', 'uuid', 'enum', 'custom', 'ip4', 'ip6', 'buffer', 'bits', 'money', 'crypto', 'decimal', 'geo:lat', 'geo:lon', 'geo:point', 'geo-lat', 'geo-lon', 'geo-point', 'secret', 'password', 'embedding'];
                const typeValue = value.type;
                const isValidValidatorType = typeof typeValue === 'string' &&
                    !typeValue.includes('|') &&
                    (validatorTypes.includes(typeValue) || typeValue.startsWith('bits:') || typeValue.startsWith('embedding:'));
                const hasValidatorType = isValidValidatorType && key !== '$$type';

                if (hasValidatorType) {
                    // Remove plugin metadata from all object definitions
                    const { __plugin__, __pluginCreated__, ...cleanValue } = value;

                    // Handle ip4 and ip6 object notation
                    if (cleanValue.type === 'ip4') {
                        processed[key] = { ...cleanValue, type: 'string' };
                    } else if (cleanValue.type === 'ip6') {
                        processed[key] = { ...cleanValue, type: 'string' };
                    } else if (cleanValue.type === 'buffer') {
                        // Buffer type → any (validated by hooks)
                        processed[key] = { ...cleanValue, type: 'any' };
                    } else if (cleanValue.type === 'bits' || cleanValue.type?.startsWith('bits:')) {
                        // Bits type → any (validated by hooks)
                        processed[key] = { ...cleanValue, type: 'any' };
                    } else if (cleanValue.type === 'money' || cleanValue.type === 'crypto') {
                        // Money/crypto type → number with min:0
                        processed[key] = { ...cleanValue, type: 'number', min: cleanValue.min !== undefined ? cleanValue.min : 0 };
                    } else if (cleanValue.type === 'decimal') {
                        // Decimal type → number
                        processed[key] = { ...cleanValue, type: 'number' };
                    } else if (cleanValue.type === 'geo:lat' || cleanValue.type === 'geo-lat') {
                        // Geo latitude → number with range [-90, 90]
                        processed[key] = {
                            ...cleanValue,
                            type: 'number',
                            min: cleanValue.min !== undefined ? cleanValue.min : -90,
                            max: cleanValue.max !== undefined ? cleanValue.max : 90
                        };
                    } else if (cleanValue.type === 'geo:lon' || cleanValue.type === 'geo-lon') {
                        // Geo longitude → number with range [-180, 180]
                        processed[key] = {
                            ...cleanValue,
                            type: 'number',
                            min: cleanValue.min !== undefined ? cleanValue.min : -180,
                            max: cleanValue.max !== undefined ? cleanValue.max : 180
                        };
                    } else if (cleanValue.type === 'geo:point' || cleanValue.type === 'geo-point') {
                        // Geo point → any (will be validated in hooks)
                        processed[key] = { ...cleanValue, type: 'any' };
                    } else if (cleanValue.type === 'object' && cleanValue.properties) {
                        // Recursively process nested object properties
                        processed[key] = {
                            ...cleanValue,
                            properties: this.preprocessAttributesForValidation(cleanValue.properties)
                        };
                    } else if (cleanValue.type === 'object' && cleanValue.props) {
                        // Recursively process nested object props (fastest-validator format)
                        processed[key] = {
                            ...cleanValue,
                            props: this.preprocessAttributesForValidation(cleanValue.props)
                        };
                    } else {
                        // This is a validator type definition (e.g., { type: 'array', items: 'number' })
                        processed[key] = cleanValue;
                    }
                } else {
                    // This is a nested object structure, wrap it for validation
                    const isExplicitRequired = value.$$type && value.$$type.includes('required');
                    const isExplicitOptional = value.$$type && value.$$type.includes('optional');
                    const objectConfig = {
                        type: 'object',
                        props: this.preprocessAttributesForValidation(value),
                        strict: false
                    };
                    // If explicitly required, don't mark as optional
                    if (isExplicitRequired) {
                        // nothing
                    } else if (isExplicitOptional || this.allNestedObjectsOptional) {
                        objectConfig.optional = true;
                    }
                    processed[key] = objectConfig;
                }
            } else {
                processed[key] = value;
            }
        }

        return processed;
    }

    /**
     * Apply default values from schema to data
     * @param {Object} data - Data to apply defaults to
     * @returns {Object} Data with defaults applied
     */
    applyDefaults(data) {
        const out = { ...data };
        for (const [key, def] of Object.entries(this.attributes)) {
            if (out[key] === undefined) {
                if (typeof def === 'string' && def.includes('default:')) {
                    const match = def.match(/default:([^|]+)/);
                    if (match) {
                        let val = match[1];
                        // Convert to boolean/number if necessary
                        if (def.includes('boolean')) val = val === 'true';
                        else if (def.includes('number')) val = Number(val);
                        out[key] = val;
                    }
                }
            }
        }
        return out;
    }
}
