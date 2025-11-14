/**
 * OIDC Error Handling Utilities
 *
 * Generates user-friendly error pages and responses for OIDC failures.
 *
 * @module api/concerns/oidc-errors
 */

/**
 * OIDC Error Types
 */
export const ErrorTypes = {
  // Configuration errors
  CONFIG_INVALID: 'config_invalid',
  MISSING_FIELD: 'missing_field',

  // Token errors
  TOKEN_EXPIRED: 'token_expired',
  TOKEN_INVALID: 'token_invalid',
  TOKEN_MISSING: 'token_missing',

  // Validation errors
  ISSUER_MISMATCH: 'issuer_mismatch',
  AUDIENCE_MISMATCH: 'audience_mismatch',
  NONCE_MISMATCH: 'nonce_mismatch',

  // Provider errors
  PROVIDER_ERROR: 'provider_error',
  NETWORK_ERROR: 'network_error',
  DISCOVERY_FAILED: 'discovery_failed',

  // State errors
  STATE_MISMATCH: 'state_mismatch',
  STATE_EXPIRED: 'state_expired',

  // Generic
  UNKNOWN: 'unknown'
};

/**
 * Get error type from validation errors
 *
 * @param {Array<string>} errors - Validation errors
 * @returns {string} Error type
 */
export function getErrorType(errors) {
  if (!errors || errors.length === 0) {
    return ErrorTypes.UNKNOWN;
  }

  const firstError = errors[0].toLowerCase();

  if (firstError.includes('expired') || firstError.includes('too old')) {
    return ErrorTypes.TOKEN_EXPIRED;
  }
  if (firstError.includes('issuer')) {
    return ErrorTypes.ISSUER_MISMATCH;
  }
  if (firstError.includes('audience')) {
    return ErrorTypes.AUDIENCE_MISMATCH;
  }
  if (firstError.includes('nonce')) {
    return ErrorTypes.NONCE_MISMATCH;
  }
  if (firstError.includes('missing') && firstError.includes('token')) {
    return ErrorTypes.TOKEN_MISSING;
  }
  if (firstError.includes('invalid') && firstError.includes('token')) {
    return ErrorTypes.TOKEN_INVALID;
  }

  return ErrorTypes.UNKNOWN;
}

/**
 * Generate user-friendly error message
 *
 * @param {string} errorType - Error type
 * @param {Array<string>} errors - Detailed errors
 * @returns {Object} { title, message, action }
 */
export function getErrorDetails(errorType, errors = []) {
  const errorMap = {
    [ErrorTypes.TOKEN_EXPIRED]: {
      title: 'Session Expired',
      message: 'Your session has expired. Please sign in again to continue.',
      action: 'Sign In Again',
      userAction: true
    },
    [ErrorTypes.TOKEN_INVALID]: {
      title: 'Invalid Session',
      message: 'Your session is invalid or corrupted. Please sign in again.',
      action: 'Sign In Again',
      userAction: true
    },
    [ErrorTypes.TOKEN_MISSING]: {
      title: 'Authentication Required',
      message: 'You need to sign in to access this resource.',
      action: 'Sign In',
      userAction: true
    },
    [ErrorTypes.ISSUER_MISMATCH]: {
      title: 'Configuration Error',
      message: 'Authentication provider configuration mismatch. Please contact support.',
      action: 'Contact Support',
      userAction: false
    },
    [ErrorTypes.AUDIENCE_MISMATCH]: {
      title: 'Configuration Error',
      message: 'Authentication audience mismatch. Please contact support.',
      action: 'Contact Support',
      userAction: false
    },
    [ErrorTypes.NONCE_MISMATCH]: {
      title: 'Security Error',
      message: 'Invalid authentication state detected. Please try signing in again.',
      action: 'Try Again',
      userAction: true
    },
    [ErrorTypes.STATE_MISMATCH]: {
      title: 'Security Error',
      message: 'Invalid authentication state. This may be a replay attack. Please try again.',
      action: 'Sign In Again',
      userAction: true
    },
    [ErrorTypes.STATE_EXPIRED]: {
      title: 'Request Expired',
      message: 'Your authentication request has expired. Please start over.',
      action: 'Sign In Again',
      userAction: true
    },
    [ErrorTypes.PROVIDER_ERROR]: {
      title: 'Provider Error',
      message: 'The authentication provider encountered an error. Please try again later.',
      action: 'Try Again',
      userAction: true
    },
    [ErrorTypes.NETWORK_ERROR]: {
      title: 'Connection Error',
      message: 'Unable to connect to authentication provider. Please check your connection.',
      action: 'Try Again',
      userAction: true
    },
    [ErrorTypes.DISCOVERY_FAILED]: {
      title: 'Discovery Failed',
      message: 'Unable to discover authentication provider configuration. Please contact support.',
      action: 'Contact Support',
      userAction: false
    },
    [ErrorTypes.CONFIG_INVALID]: {
      title: 'Configuration Error',
      message: 'Invalid authentication configuration. Please contact support.',
      action: 'Contact Support',
      userAction: false
    },
    [ErrorTypes.UNKNOWN]: {
      title: 'Authentication Failed',
      message: 'An unexpected error occurred. Please try again or contact support.',
      action: 'Try Again',
      userAction: true
    }
  };

  const details = errorMap[errorType] || errorMap[ErrorTypes.UNKNOWN];

  return {
    ...details,
    errorType,
    technicalDetails: errors.length > 0 ? errors : undefined
  };
}

/**
 * Generate HTML error page
 *
 * @param {Object} errorDetails - Error details from getErrorDetails()
 * @param {Object} options - Options (returnUrl, supportUrl, etc.)
 * @returns {string} HTML error page
 */
export function generateErrorPage(errorDetails, options = {}) {
  const {
    returnUrl = '/',
    loginUrl = '/auth/login',
    supportUrl = null,
    showTechnicalDetails = false
  } = options;

  const actionUrl = errorDetails.userAction ? loginUrl : (supportUrl || returnUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${errorDetails.title} - Authentication Error</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .error-container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 500px;
      width: 100%;
      padding: 40px;
      text-align: center;
    }
    .error-icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    .error-title {
      font-size: 28px;
      font-weight: 600;
      color: #1a202c;
      margin-bottom: 16px;
    }
    .error-message {
      font-size: 16px;
      color: #4a5568;
      line-height: 1.6;
      margin-bottom: 32px;
    }
    .error-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn {
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #667eea;
      color: white;
    }
    .btn-primary:hover {
      background: #5568d3;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .btn-secondary {
      background: #e2e8f0;
      color: #4a5568;
    }
    .btn-secondary:hover {
      background: #cbd5e0;
    }
    .technical-details {
      margin-top: 32px;
      padding: 16px;
      background: #f7fafc;
      border-radius: 6px;
      border-left: 4px solid #fc8181;
      text-align: left;
    }
    .technical-details summary {
      cursor: pointer;
      font-weight: 600;
      color: #2d3748;
      margin-bottom: 12px;
    }
    .technical-details ul {
      list-style: none;
      padding-left: 0;
    }
    .technical-details li {
      font-size: 13px;
      color: #718096;
      padding: 4px 0;
      font-family: "Courier New", monospace;
    }
    .error-code {
      margin-top: 24px;
      font-size: 12px;
      color: #a0aec0;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-icon">🔒</div>
    <h1 class="error-title">${errorDetails.title}</h1>
    <p class="error-message">${errorDetails.message}</p>

    <div class="error-actions">
      <a href="${actionUrl}" class="btn btn-primary">${errorDetails.action}</a>
      ${returnUrl !== actionUrl ? `<a href="${returnUrl}" class="btn btn-secondary">Go Home</a>` : ''}
    </div>

    ${showTechnicalDetails && errorDetails.technicalDetails ? `
    <details class="technical-details">
      <summary>Technical Details</summary>
      <ul>
        ${errorDetails.technicalDetails.map(err => `<li>• ${err}</li>`).join('\n        ')}
      </ul>
    </details>
    ` : ''}

    <div class="error-code">Error Code: ${errorDetails.errorType}</div>
  </div>
</body>
</html>`;
}

/**
 * Generate JSON error response
 *
 * @param {Object} errorDetails - Error details from getErrorDetails()
 * @param {number} statusCode - HTTP status code
 * @returns {Object} JSON error response
 */
export function generateErrorJSON(errorDetails, statusCode = 401) {
  return {
    error: {
      code: errorDetails.errorType,
      title: errorDetails.title,
      message: errorDetails.message,
      userAction: errorDetails.userAction,
      ...(errorDetails.technicalDetails ? { details: errorDetails.technicalDetails } : {})
    },
    statusCode
  };
}
