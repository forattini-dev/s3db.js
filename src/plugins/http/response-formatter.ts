export interface SuccessOptions {
  status?: number;
  meta?: Record<string, unknown>;
}

export interface ErrorOptions {
  status?: number;
  code?: string;
  details?: Record<string, unknown>;
}

export interface PaginationInfo {
  total?: number;
  page?: number;
  pageSize?: number;
  pageCount?: number;
}

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta: {
    timestamp: string;
    [key: string]: unknown;
  };
  _status: number;
}

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details: Record<string, unknown>;
    stack?: string;
  };
  meta: {
    timestamp: string;
  };
  _status: number;
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
  meta: {
    timestamp: string;
  };
  _status: number;
}

export interface CreatedResponse<T = unknown> {
  success: true;
  data: T;
  meta: {
    timestamp: string;
    location?: string;
  };
  _status: number;
}

export interface NoContentResponse {
  success: true;
  data: null;
  meta: {
    timestamp: string;
  };
  _status: number;
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse | ListResponse<T> | CreatedResponse<T> | NoContentResponse;

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

export function error(err: string | Error, options: ErrorOptions = {}): ErrorResponse {
  const { status = 500, code = 'INTERNAL_ERROR', details = {} } = options;

  const errorMessage = err instanceof Error ? err.message : err;
  const errorStack = err instanceof Error && process.env.NODE_ENV !== 'production'
    ? err.stack
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
      total: total || items.length,
      page: page || 1,
      pageSize: pageSize || items.length,
      pageCount: pageCount || 1
    },
    meta: {
      timestamp: new Date().toISOString()
    },
    _status: 200
  };
}

export function created<T = unknown>(data: T, location?: string): CreatedResponse<T> {
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

export function noContent(): NoContentResponse {
  return {
    success: true,
    data: null,
    meta: {
      timestamp: new Date().toISOString()
    },
    _status: 204
  };
}

export interface ValidationErrorItem {
  field?: string;
  message?: string;
  [key: string]: unknown;
}

export function validationError(errors: ValidationErrorItem[]): ErrorResponse {
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

export interface CustomFormatters {
  success?: <T>(data: T, meta?: Record<string, unknown>) => SuccessResponse<T>;
  error?: (err: string | Error, status?: number, code?: string) => ErrorResponse;
  list?: <T>(items: T[], pagination?: PaginationInfo) => ListResponse<T>;
  created?: <T>(data: T, location?: string) => CreatedResponse<T>;
  noContent?: () => NoContentResponse;
  validationError?: (errors: ValidationErrorItem[]) => ErrorResponse;
  notFound?: (resource: string, id: string) => ErrorResponse;
  unauthorized?: (message?: string) => ErrorResponse;
  forbidden?: (message?: string) => ErrorResponse;
  rateLimitExceeded?: (retryAfter: number) => ErrorResponse;
  payloadTooLarge?: (size: number, limit: number) => ErrorResponse;
}

export interface Formatters {
  success: <T>(data: T, meta?: Record<string, unknown>) => SuccessResponse<T>;
  error: (err: string | Error, status?: number, code?: string) => ErrorResponse;
  list: <T>(items: T[], pagination?: PaginationInfo) => ListResponse<T>;
  created: <T>(data: T, location?: string) => CreatedResponse<T>;
  noContent: () => NoContentResponse;
  validationError: (errors: ValidationErrorItem[]) => ErrorResponse;
  notFound: (resource: string, id: string) => ErrorResponse;
  unauthorized: (message?: string) => ErrorResponse;
  forbidden: (message?: string) => ErrorResponse;
  rateLimitExceeded: (retryAfter: number) => ErrorResponse;
  payloadTooLarge: (size: number, limit: number) => ErrorResponse;
}

export function createCustomFormatters(customFormatters: CustomFormatters = {}): Formatters {
  const defaults: Formatters = {
    success: <T>(data: T, meta: Record<string, unknown> = {}) => success(data, { meta }),
    error: (err: string | Error, status?: number, code?: string) => error(err, { status, code }),
    list: <T>(items: T[], pagination?: PaginationInfo) => list(items, pagination),
    created: <T>(data: T, location?: string) => created(data, location),
    noContent: () => noContent(),
    validationError: (errors: ValidationErrorItem[]) => validationError(errors),
    notFound: (resource: string, id: string) => notFound(resource, id),
    unauthorized: (message?: string) => unauthorized(message),
    forbidden: (message?: string) => forbidden(message),
    rateLimitExceeded: (retryAfter: number) => rateLimitExceeded(retryAfter),
    payloadTooLarge: (size: number, limit: number) => payloadTooLarge(size, limit)
  };

  return {
    ...defaults,
    ...customFormatters
  };
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
  createCustomFormatters
};
