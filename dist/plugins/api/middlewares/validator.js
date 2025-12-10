import { validationError } from '../utils/response-formatter.js';
const validationMiddlewareCache = new WeakMap();
export function createValidationMiddleware(resource, options = {}) {
    if (validationMiddlewareCache.has(resource)) {
        const cached = validationMiddlewareCache.get(resource);
        const optionsKey = JSON.stringify(options);
        if (cached.optionsKey === optionsKey) {
            return cached.middleware;
        }
    }
    const { validateOnInsert = true, validateOnUpdate = true, partial = true } = options;
    const schema = resource.schema;
    const middleware = async (c, next) => {
        const method = c.req.method;
        const shouldValidate = (method === 'POST' && validateOnInsert) ||
            ((method === 'PUT' || method === 'PATCH') && validateOnUpdate);
        if (!shouldValidate) {
            return await next();
        }
        let data;
        try {
            data = await c.req.json();
        }
        catch {
            const response = validationError([
                { field: 'body', message: 'Invalid JSON in request body' }
            ]);
            return c.json(response, response._status);
        }
        const isPartial = method === 'PATCH' && partial;
        const validationResult = schema.validate(data, {
            partial: isPartial,
            strict: !isPartial
        });
        if (!validationResult.valid) {
            const errors = (validationResult.errors || []).map((err) => ({
                field: err.field || err.attribute || 'unknown',
                message: err.message,
                expected: err.expected,
                actual: err.actual
            }));
            const response = validationError(errors);
            return c.json(response, response._status);
        }
        c.set('validatedData', validationResult.data || data);
        await next();
    };
    const optionsKey = JSON.stringify(options);
    validationMiddlewareCache.set(resource, { middleware, optionsKey });
    return middleware;
}
export function createQueryValidation(schema = {}) {
    return async (c, next) => {
        const query = c.req.query();
        const errors = [];
        for (const [key, rules] of Object.entries(schema)) {
            const value = query[key];
            if (rules.required && !value) {
                errors.push({
                    field: key,
                    message: `Query parameter '${key}' is required`
                });
                continue;
            }
            if (!value)
                continue;
            if (rules.type) {
                if (rules.type === 'number' && isNaN(Number(value))) {
                    errors.push({
                        field: key,
                        message: `Query parameter '${key}' must be a number`,
                        actual: value
                    });
                }
                if (rules.type === 'boolean' && !['true', 'false', '1', '0'].includes(value.toLowerCase())) {
                    errors.push({
                        field: key,
                        message: `Query parameter '${key}' must be a boolean`,
                        actual: value
                    });
                }
            }
            if (rules.type === 'number') {
                const num = Number(value);
                if (rules.min !== undefined && num < rules.min) {
                    errors.push({
                        field: key,
                        message: `Query parameter '${key}' must be at least ${rules.min}`,
                        actual: num
                    });
                }
                if (rules.max !== undefined && num > rules.max) {
                    errors.push({
                        field: key,
                        message: `Query parameter '${key}' must be at most ${rules.max}`,
                        actual: num
                    });
                }
            }
            if (rules.enum && !rules.enum.includes(value)) {
                errors.push({
                    field: key,
                    message: `Query parameter '${key}' must be one of: ${rules.enum.join(', ')}`,
                    actual: value
                });
            }
        }
        if (errors.length > 0) {
            const response = validationError(errors);
            return c.json(response, response._status);
        }
        await next();
    };
}
export const listQueryValidation = createQueryValidation({
    limit: {
        type: 'number',
        min: 1,
        max: 1000
    },
    offset: {
        type: 'number',
        min: 0
    },
    partition: {
        type: 'string'
    },
    partitionValues: {
        type: 'string'
    }
});
export default {
    createValidationMiddleware,
    createQueryValidation,
    listQueryValidation
};
//# sourceMappingURL=validator.js.map