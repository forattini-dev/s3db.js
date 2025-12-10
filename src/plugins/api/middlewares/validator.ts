import type { Context, MiddlewareHandler, Next } from 'hono';
import { validationError } from '../utils/response-formatter.js';

export interface ValidationOptions {
  validateOnInsert?: boolean;
  validateOnUpdate?: boolean;
  partial?: boolean;
}

export interface ValidationError {
  field?: string;
  attribute?: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  data?: Record<string, unknown>;
}

export interface SchemaLike {
  validate(data: unknown, options?: { partial?: boolean; strict?: boolean }): ValidationResult;
}

export interface ResourceLike {
  schema: SchemaLike;
}

export interface QueryParamRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean';
  min?: number;
  max?: number;
  enum?: string[];
}

export interface QuerySchema {
  [key: string]: QueryParamRule;
}

export interface FormattedError {
  field: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

interface CachedMiddleware {
  middleware: MiddlewareHandler;
  optionsKey: string;
}

const validationMiddlewareCache = new WeakMap<ResourceLike, CachedMiddleware>();

export function createValidationMiddleware(resource: ResourceLike, options: ValidationOptions = {}): MiddlewareHandler {
  if (validationMiddlewareCache.has(resource)) {
    const cached = validationMiddlewareCache.get(resource)!;
    const optionsKey = JSON.stringify(options);
    if (cached.optionsKey === optionsKey) {
      return cached.middleware;
    }
  }

  const {
    validateOnInsert = true,
    validateOnUpdate = true,
    partial = true
  } = options;

  const schema = resource.schema;

  const middleware: MiddlewareHandler = async (c: Context, next: Next): Promise<void | Response> => {
    const method = c.req.method;
    const shouldValidate =
      (method === 'POST' && validateOnInsert) ||
      ((method === 'PUT' || method === 'PATCH') && validateOnUpdate);

    if (!shouldValidate) {
      return await next();
    }

    let data: unknown;
    try {
      data = await c.req.json();
    } catch {
      const response = validationError([
        { field: 'body', message: 'Invalid JSON in request body' }
      ] as unknown as Parameters<typeof validationError>[0]);
      return c.json(response, response._status as Parameters<typeof c.json>[1]);
    }

    const isPartial = method === 'PATCH' && partial;

    const validationResult = schema.validate(data, {
      partial: isPartial,
      strict: !isPartial
    });

    if (!validationResult.valid) {
      const errors: FormattedError[] = (validationResult.errors || []).map((err: ValidationError) => ({
        field: err.field || err.attribute || 'unknown',
        message: err.message,
        expected: err.expected,
        actual: err.actual
      }));

      const response = validationError(errors as unknown as Parameters<typeof validationError>[0]);
      return c.json(response, response._status as Parameters<typeof c.json>[1]);
    }

    c.set('validatedData', validationResult.data || data);

    await next();
  };

  const optionsKey = JSON.stringify(options);
  validationMiddlewareCache.set(resource, { middleware, optionsKey });

  return middleware;
}

export function createQueryValidation(schema: QuerySchema = {}): MiddlewareHandler {
  return async (c: Context, next: Next): Promise<void | Response> => {
    const query = c.req.query();
    const errors: FormattedError[] = [];

    for (const [key, rules] of Object.entries(schema)) {
      const value = query[key];

      if (rules.required && !value) {
        errors.push({
          field: key,
          message: `Query parameter '${key}' is required`
        });
        continue;
      }

      if (!value) continue;

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
      const response = validationError(errors as unknown as Parameters<typeof validationError>[0]);
      return c.json(response, response._status as Parameters<typeof c.json>[1]);
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
