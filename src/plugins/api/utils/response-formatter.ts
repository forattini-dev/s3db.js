export interface ResponseMeta {
  timestamp: string;
  location?: string;
  [key: string]: unknown;
}

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta: ResponseMeta;
  _status: number;
}

export interface ErrorDetails {
  errors?: ValidationError[];
  resource?: string;
  id?: string;
  retryAfter?: number;
  receivedSize?: number;
  maxSize?: number;
  receivedMB?: string;
  maxMB?: string;
  [key: string]: unknown;
}

export interface ErrorResponseBody {
  message: string;
  code: string;
  details: ErrorDetails;
  stack?: string;
}

export interface ErrorResponse {
  success: false;
  error: ErrorResponseBody;
  meta: ResponseMeta;
  _status: number;
}

export interface PaginationInfo {
  total?: number;
  page?: number;
  pageSize?: number;
  pageCount?: number;
}

export interface ListResponse<T = unknown> {
  success: true;
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  };
  meta: ResponseMeta;
  _status: number;
}

export interface SuccessOptions {
  status?: number;
  meta?: Record<string, unknown>;
}

export interface ErrorOptions {
  status?: number;
  code?: string;
  details?: ErrorDetails;
}

export interface ValidationError {
  field: string;
  message: string;
  [key: string]: unknown;
}

function deleteNestedField(obj: Record<string, unknown>, path: string): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
      return;
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1];
  if (current && typeof current === 'object' && lastPart !== undefined && lastPart in current) {
    delete current[lastPart];
  }
}

export function filterProtectedFields<T>(data: T, protectedFields: string[] | null | undefined): T {
  if (!protectedFields || protectedFields.length === 0) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => filterProtectedFields(item, protectedFields)) as unknown as T;
  }

  if (data === null || typeof data !== 'object') {
    return data;
  }

  const result = { ...(data as Record<string, unknown>) };

  for (const fieldPath of protectedFields) {
    deleteNestedField(result, fieldPath);
  }

  return result as T;
}

export function success<T = unknown>(data: T, options: SuccessOptions = {}): SuccessResponse<T> {
  const { status = 200, meta = {} } = options;

  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    },
    _status: status
  };
}

export function error(errorInput: string | Error, options: ErrorOptions = {}): ErrorResponse {
  const { status = 500, code = 'INTERNAL_ERROR', details = {} } = options;

  const errorMessage = errorInput instanceof Error ? errorInput.message : errorInput;
  const errorStack = errorInput instanceof Error && process.env.NODE_ENV !== 'production'
    ? errorInput.stack
    : undefined;

  return {
    success: false,
    error: {
      message: errorMessage,
      code,
      details,
      stack: errorStack
    },
    meta: {
      timestamp: new Date().toISOString()
    },
    _status: status
  };
}

export function list<T = unknown>(items: T[], pagination: PaginationInfo = {}): ListResponse<T> {
  const { total, page, pageSize, pageCount } = pagination;

  return {
    success: true,
    data: items,
    pagination: {
      total: total ?? items.length,
      page: page ?? 1,
      pageSize: pageSize ?? items.length,
      pageCount: pageCount ?? 1
    },
    meta: {
      timestamp: new Date().toISOString()
    },
    _status: 200
  };
}

export function created<T = unknown>(data: T, location?: string): SuccessResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      location
    },
    _status: 201
  };
}

export function noContent(): SuccessResponse<null> {
  return {
    success: true,
    data: null,
    meta: {
      timestamp: new Date().toISOString()
    },
    _status: 204
  };
}

export function validationError(errors: ValidationError[]): ErrorResponse {
  return error('Validation failed', {
    status: 400,
    code: 'VALIDATION_ERROR',
    details: { errors }
  });
}

export function notFound(resource: string, id: string): ErrorResponse {
  return error(`${resource} with id '${id}' not found`, {
    status: 404,
    code: 'NOT_FOUND',
    details: { resource, id }
  });
}

export function unauthorized(message: string = 'Unauthorized'): ErrorResponse {
  return error(message, {
    status: 401,
    code: 'UNAUTHORIZED'
  });
}

export function forbidden(message: string = 'Forbidden'): ErrorResponse {
  return error(message, {
    status: 403,
    code: 'FORBIDDEN'
  });
}

export function rateLimitExceeded(retryAfter: number): ErrorResponse {
  return error('Rate limit exceeded', {
    status: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    details: { retryAfter }
  });
}

export function payloadTooLarge(size: number, limit: number): ErrorResponse {
  return error('Request payload too large', {
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
    details: {
      receivedSize: size,
      maxSize: limit,
      receivedMB: (size / 1024 / 1024).toFixed(2),
      maxMB: (limit / 1024 / 1024).toFixed(2)
    }
  });
}

export default {
  success,
  error,
  list,
  created,
  noContent,
  validationError,
  notFound,
  unauthorized,
  forbidden,
  rateLimitExceeded,
  payloadTooLarge,
  filterProtectedFields
};
