/**
 * RouteContext - Single, clean context for route handlers
 *
 * Wraps Hono context (c) and injects db/resources plus helper methods
 * Keeps Hono context "clean" while providing rich functionality
 */

export class RouteContext {
  constructor(c, { db = null, resources = null } = {}) {
    this.c = c;
    this.db = db;
    this.resources = resources;
  }

  // Request helpers (delegate to Hono context)
  get req() {
    return this.c.req;
  }

  get res() {
    return this.c.res;
  }

  get var() {
    return this.c.var.bind(this.c);
  }

  get set() {
    return this.c.set.bind(this.c);
  }

  get get() {
    return this.c.get.bind(this.c);
  }

  // Parse request data
  async body() {
    return await this.c.req.json();
  }

  query(key) {
    if (key) {
      return this.c.req.query(key);
    }
    return this.c.req.query();
  }

  param(key) {
    return this.c.req.param(key);
  }

  header(name) {
    return this.c.req.header(name);
  }

  // Success response helper
  success(data = {}, status = 200) {
    const response = {
      success: true,
      ...(typeof data === 'object' && data !== null ? data : { data })
    };
    return this.c.json(response, status);
  }

  // Error response helper
  error(message, { status = 400, code = 'ERROR', details = null } = {}) {
    const response = {
      success: false,
      error: {
        message,
        code,
        status,
        ...(details ? { details } : {})
      }
    };
    return this.c.json(response, status);
  }

  // Standard error responses
  badRequest(message = 'Bad request', details = null) {
    return this.error(message, { status: 400, code: 'BAD_REQUEST', details });
  }

  unauthorized(message = 'Unauthorized', details = null) {
    return this.error(message, { status: 401, code: 'UNAUTHORIZED', details });
  }

  forbidden(message = 'Forbidden', details = null) {
    return this.error(message, { status: 403, code: 'FORBIDDEN', details });
  }

  notFound(message = 'Not found', details = null) {
    return this.error(message, { status: 404, code: 'NOT_FOUND', details });
  }

  validationError(message = 'Validation failed', details = null) {
    return this.error(message, { status: 422, code: 'VALIDATION_ERROR', details });
  }

  serverError(message = 'Internal server error', details = null) {
    return this.error(message, { status: 500, code: 'INTERNAL_ERROR', details });
  }

  // Direct JSON response (for custom cases)
  json(data, status = 200) {
    return this.c.json(data, status);
  }

  // Text response
  text(text, status = 200) {
    return this.c.text(text, status);
  }

  // HTML response
  html(html, status = 200) {
    return this.c.html(html, status);
  }

  // Redirect
  redirect(location, status = 302) {
    return this.c.redirect(location, status);
  }

  // Access to raw Hono context (escape hatch)
  get raw() {
    return this.c;
  }
}
