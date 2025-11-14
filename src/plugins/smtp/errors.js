import { PluginError } from '../../errors.js';

/**
 * SMTPError - Base error for SMTP operations
 * Retryable by default unless explicitly marked otherwise
 */
export class SMTPError extends PluginError {
  constructor(message, options = {}) {
    super(message, {
      pluginName: 'SMTPPlugin',
      retriable: options.retriable !== false, // retryable by default
      statusCode: options.statusCode || 500,
      ...options
    });
    this.name = 'SMTPError';
    this.originalError = options.originalError || null;
  }
}

/**
 * AuthenticationError - Authentication failed
 * Non-retryable: invalid credentials won't work on retry
 */
export class AuthenticationError extends SMTPError {
  constructor(message, options = {}) {
    super(message, {
      retriable: false,
      statusCode: 401,
      ...options
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * TemplateError - Template compilation/rendering failed
 * Non-retryable: template issue won't resolve on retry
 */
export class TemplateError extends SMTPError {
  constructor(message, options = {}) {
    super(message, {
      retriable: false,
      statusCode: 400,
      ...options
    });
    this.name = 'TemplateError';
  }
}

/**
 * RateLimitError - Rate limit exceeded
 * Retryable: should back off and retry later
 */
export class RateLimitError extends SMTPError {
  constructor(message, options = {}) {
    super(message, {
      retriable: true,
      statusCode: 429,
      ...options
    });
    this.name = 'RateLimitError';
  }
}

/**
 * RecipientError - Invalid or forbidden recipient
 * Non-retryable: invalid email won't work on retry
 */
export class RecipientError extends SMTPError {
  constructor(message, options = {}) {
    super(message, {
      retriable: false,
      statusCode: 400,
      ...options
    });
    this.name = 'RecipientError';
  }
}

/**
 * ConnectionError - SMTP connection failed
 * Retryable: transient network issue
 */
export class ConnectionError extends SMTPError {
  constructor(message, options = {}) {
    super(message, {
      retriable: true,
      statusCode: 503,
      ...options
    });
    this.name = 'ConnectionError';
  }
}

/**
 * AttachmentError - Attachment processing failed
 * Non-retryable: invalid attachment won't work on retry
 */
export class AttachmentError extends SMTPError {
  constructor(message, options = {}) {
    super(message, {
      retriable: false,
      statusCode: 400,
      ...options
    });
    this.name = 'AttachmentError';
  }
}
