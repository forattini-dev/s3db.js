/**
 * Tests for OIDC Error Handling Utilities
 * @group api
 */

import {
  ErrorTypes,
  getErrorType,
  getErrorDetails,
  generateErrorPage,
  generateErrorJSON
} from '../../../src/plugins/api/concerns/oidc-errors.js';

describe('OIDC Error Handling', () => {
  describe('getErrorType', () => {
    test('detects token expired error', () => {
      const errors = ['Token expired at 2024-01-01'];
      const type = getErrorType(errors);
      expect(type).toBe(ErrorTypes.TOKEN_EXPIRED);
    });

    test('detects token too old error', () => {
      const errors = ['Token too old (issued 25 hours ago)'];
      const type = getErrorType(errors);
      expect(type).toBe(ErrorTypes.TOKEN_EXPIRED);
    });

    test('detects issuer mismatch error', () => {
      const errors = ['Invalid issuer: expected "https://a.com"'];
      const type = getErrorType(errors);
      expect(type).toBe(ErrorTypes.ISSUER_MISMATCH);
    });

    test('detects audience mismatch error', () => {
      const errors = ['Invalid audience: expected "client-123"'];
      const type = getErrorType(errors);
      expect(type).toBe(ErrorTypes.AUDIENCE_MISMATCH);
    });

    test('detects nonce mismatch error', () => {
      const errors = ['Invalid nonce (possible replay attack)'];
      const type = getErrorType(errors);
      expect(type).toBe(ErrorTypes.NONCE_MISMATCH);
    });

    test('detects missing token error', () => {
      const errors = ['Missing access_token in response'];
      const type = getErrorType(errors);
      expect(type).toBe(ErrorTypes.TOKEN_MISSING);
    });

    test('detects invalid token error', () => {
      const errors = ['Invalid token format'];
      const type = getErrorType(errors);
      expect(type).toBe(ErrorTypes.TOKEN_INVALID);
    });

    test('returns UNKNOWN for unrecognized errors', () => {
      const errors = ['Something went wrong'];
      const type = getErrorType(errors);
      expect(type).toBe(ErrorTypes.UNKNOWN);
    });

    test('handles empty errors array', () => {
      const type = getErrorType([]);
      expect(type).toBe(ErrorTypes.UNKNOWN);
    });
  });

  describe('getErrorDetails', () => {
    test('provides details for TOKEN_EXPIRED', () => {
      const details = getErrorDetails(ErrorTypes.TOKEN_EXPIRED, ['Token expired']);
      expect(details.title).toBe('Session Expired');
      expect(details.message).toContain('session has expired');
      expect(details.action).toBe('Sign In Again');
      expect(details.userAction).toBe(true);
      expect(details.technicalDetails).toEqual(['Token expired']);
    });

    test('provides details for TOKEN_INVALID', () => {
      const details = getErrorDetails(ErrorTypes.TOKEN_INVALID);
      expect(details.title).toBe('Invalid Session');
      expect(details.userAction).toBe(true);
    });

    test('provides details for TOKEN_MISSING', () => {
      const details = getErrorDetails(ErrorTypes.TOKEN_MISSING);
      expect(details.title).toBe('Authentication Required');
      expect(details.action).toBe('Sign In');
    });

    test('provides details for ISSUER_MISMATCH', () => {
      const details = getErrorDetails(ErrorTypes.ISSUER_MISMATCH);
      expect(details.title).toBe('Configuration Error');
      expect(details.userAction).toBe(false);
      expect(details.action).toBe('Contact Support');
    });

    test('provides details for AUDIENCE_MISMATCH', () => {
      const details = getErrorDetails(ErrorTypes.AUDIENCE_MISMATCH);
      expect(details.title).toBe('Configuration Error');
      expect(details.userAction).toBe(false);
    });

    test('provides details for NONCE_MISMATCH', () => {
      const details = getErrorDetails(ErrorTypes.NONCE_MISMATCH);
      expect(details.title).toBe('Security Error');
      expect(details.message).toContain('Invalid authentication state');
    });

    test('provides details for STATE_MISMATCH', () => {
      const details = getErrorDetails(ErrorTypes.STATE_MISMATCH);
      expect(details.title).toBe('Security Error');
      expect(details.message).toContain('replay attack');
    });

    test('provides details for STATE_EXPIRED', () => {
      const details = getErrorDetails(ErrorTypes.STATE_EXPIRED);
      expect(details.title).toBe('Request Expired');
      expect(details.action).toBe('Sign In Again');
    });

    test('provides details for PROVIDER_ERROR', () => {
      const details = getErrorDetails(ErrorTypes.PROVIDER_ERROR);
      expect(details.title).toBe('Provider Error');
      expect(details.message).toContain('authentication provider encountered an error');
    });

    test('provides details for NETWORK_ERROR', () => {
      const details = getErrorDetails(ErrorTypes.NETWORK_ERROR);
      expect(details.title).toBe('Connection Error');
      expect(details.message).toContain('Unable to connect');
    });

    test('provides details for DISCOVERY_FAILED', () => {
      const details = getErrorDetails(ErrorTypes.DISCOVERY_FAILED);
      expect(details.title).toBe('Discovery Failed');
      expect(details.userAction).toBe(false);
    });

    test('provides details for CONFIG_INVALID', () => {
      const details = getErrorDetails(ErrorTypes.CONFIG_INVALID);
      expect(details.title).toBe('Configuration Error');
      expect(details.userAction).toBe(false);
    });

    test('provides details for UNKNOWN', () => {
      const details = getErrorDetails(ErrorTypes.UNKNOWN);
      expect(details.title).toBe('Authentication Failed');
      expect(details.userAction).toBe(true);
    });

    test('includes error type in response', () => {
      const details = getErrorDetails(ErrorTypes.TOKEN_EXPIRED);
      expect(details.errorType).toBe(ErrorTypes.TOKEN_EXPIRED);
    });

    test('omits technical details when not provided', () => {
      const details = getErrorDetails(ErrorTypes.TOKEN_EXPIRED);
      expect(details.technicalDetails).toBeUndefined();
    });
  });

  describe('generateErrorPage', () => {
    const errorDetails = {
      title: 'Test Error',
      message: 'This is a test error message',
      action: 'Try Again',
      userAction: true,
      errorType: 'test_error',
      technicalDetails: ['Detail 1', 'Detail 2']
    };

    test('generates valid HTML', () => {
      const html = generateErrorPage(errorDetails);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('</html>');
    });

    test('includes error title', () => {
      const html = generateErrorPage(errorDetails);
      expect(html).toContain('Test Error');
    });

    test('includes error message', () => {
      const html = generateErrorPage(errorDetails);
      expect(html).toContain('This is a test error message');
    });

    test('includes action button', () => {
      const html = generateErrorPage(errorDetails);
      expect(html).toContain('Try Again');
      expect(html).toContain('btn-primary');
    });

    test('includes error code', () => {
      const html = generateErrorPage(errorDetails);
      expect(html).toContain('test_error');
    });

    test('uses custom return URL', () => {
      const html = generateErrorPage(errorDetails, { returnUrl: '/home' });
      expect(html).toContain('href="/home"');
    });

    test('uses custom login URL for user actions', () => {
      const html = generateErrorPage(errorDetails, { loginUrl: '/custom-login' });
      expect(html).toContain('href="/custom-login"');
    });

    test('shows technical details when enabled', () => {
      const html = generateErrorPage(errorDetails, { showTechnicalDetails: true });
      expect(html).toContain('Technical Details');
      expect(html).toContain('Detail 1');
      expect(html).toContain('Detail 2');
    });

    test('hides technical details when disabled', () => {
      const html = generateErrorPage(errorDetails, { showTechnicalDetails: false });
      expect(html).not.toContain('Technical Details');
      expect(html).not.toContain('Detail 1');
    });

    test('hides technical details by default', () => {
      const html = generateErrorPage(errorDetails);
      expect(html).not.toContain('Technical Details');
    });

    test('includes home button when return URL differs from action URL', () => {
      const html = generateErrorPage(errorDetails, {
        loginUrl: '/auth/login',
        returnUrl: '/'
      });
      expect(html).toContain('Go Home');
    });

    test('omits home button when return URL matches action URL', () => {
      const html = generateErrorPage(errorDetails, {
        loginUrl: '/',
        returnUrl: '/'
      });
      expect(html).not.toContain('Go Home');
    });

    test('uses support URL for non-user actions', () => {
      const nonUserActionDetails = {
        ...errorDetails,
        userAction: false,
        action: 'Contact Support'
      };
      const html = generateErrorPage(nonUserActionDetails, {
        supportUrl: '/support',
        loginUrl: '/login'
      });
      expect(html).toContain('href="/support"');
      expect(html).not.toContain('href="/login"');
    });

    test('includes responsive CSS', () => {
      const html = generateErrorPage(errorDetails);
      expect(html).toContain('viewport');
      expect(html).toContain('width=device-width');
    });

    test('includes emoji icon', () => {
      const html = generateErrorPage(errorDetails);
      expect(html).toContain('error-icon');
      expect(html).toContain('🔒');
    });
  });

  describe('generateErrorJSON', () => {
    const errorDetails = {
      title: 'Test Error',
      message: 'This is a test error message',
      action: 'Try Again',
      userAction: true,
      errorType: 'test_error',
      technicalDetails: ['Detail 1', 'Detail 2']
    };

    test('generates valid JSON structure', () => {
      const json = generateErrorJSON(errorDetails);
      expect(json).toHaveProperty('error');
      expect(json).toHaveProperty('statusCode');
    });

    test('includes error details', () => {
      const json = generateErrorJSON(errorDetails);
      expect(json.error.code).toBe('test_error');
      expect(json.error.title).toBe('Test Error');
      expect(json.error.message).toBe('This is a test error message');
      expect(json.error.userAction).toBe(true);
    });

    test('includes technical details', () => {
      const json = generateErrorJSON(errorDetails);
      expect(json.error.details).toEqual(['Detail 1', 'Detail 2']);
    });

    test('omits technical details when not provided', () => {
      const detailsWithoutTechnical = {
        ...errorDetails,
        technicalDetails: undefined
      };
      const json = generateErrorJSON(detailsWithoutTechnical);
      expect(json.error.details).toBeUndefined();
    });

    test('uses default status code 401', () => {
      const json = generateErrorJSON(errorDetails);
      expect(json.statusCode).toBe(401);
    });

    test('uses custom status code', () => {
      const json = generateErrorJSON(errorDetails, 403);
      expect(json.statusCode).toBe(403);
    });

    test('preserves userAction flag', () => {
      const json = generateErrorJSON(errorDetails);
      expect(json.error.userAction).toBe(true);
    });
  });
});
