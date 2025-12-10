import { PluginError } from '../../errors.js';

export interface SMTPErrorOptions {
  retriable?: boolean;
  statusCode?: number;
  originalError?: Error | null;
  suggestion?: string;
  [key: string]: unknown;
}

export class SMTPError extends PluginError {
  public originalError: Error | null;

  constructor(message: string, options: SMTPErrorOptions = {}) {
    super(message, {
      pluginName: 'SMTPPlugin',
      retriable: options.retriable !== false,
      statusCode: options.statusCode || 500,
      ...options
    });
    this.name = 'SMTPError';
    this.originalError = options.originalError || null;
  }
}

export class AuthenticationError extends SMTPError {
  constructor(message: string, options: SMTPErrorOptions = {}) {
    super(message, {
      retriable: false,
      statusCode: 401,
      ...options
    });
    this.name = 'AuthenticationError';
  }
}

export class TemplateError extends SMTPError {
  constructor(message: string, options: SMTPErrorOptions = {}) {
    super(message, {
      retriable: false,
      statusCode: 400,
      ...options
    });
    this.name = 'TemplateError';
  }
}

export class RateLimitError extends SMTPError {
  constructor(message: string, options: SMTPErrorOptions = {}) {
    super(message, {
      retriable: true,
      statusCode: 429,
      ...options
    });
    this.name = 'RateLimitError';
  }
}

export class RecipientError extends SMTPError {
  constructor(message: string, options: SMTPErrorOptions = {}) {
    super(message, {
      retriable: false,
      statusCode: 400,
      ...options
    });
    this.name = 'RecipientError';
  }
}

export class ConnectionError extends SMTPError {
  constructor(message: string, options: SMTPErrorOptions = {}) {
    super(message, {
      retriable: true,
      statusCode: 503,
      ...options
    });
    this.name = 'ConnectionError';
  }
}

export class AttachmentError extends SMTPError {
  constructor(message: string, options: SMTPErrorOptions = {}) {
    super(message, {
      retriable: false,
      statusCode: 400,
      ...options
    });
    this.name = 'AttachmentError';
  }
}
