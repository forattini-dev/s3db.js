/**
 * OIDC Pushed Authorization Requests (PAR) - RFC 9126
 *
 * Enables pushed authorization requests for enhanced security.
 * Required by some banking/finance providers.
 *
 * @module api/concerns/oidc-par
 * @see https://datatracker.ietf.org/doc/html/rfc9126
 */

import { createHttpClient } from '../../../concerns/http-client.js';

let httpClient = null;

async function getHttpClient() {
  if (!httpClient) {
    httpClient = await createHttpClient({
      timeout: 30000,
      retry: {
        maxAttempts: 3,
        delay: 1000,
        backoff: 'exponential',
        retryAfter: true,
        retryOn: [429, 500, 502, 503, 504]
      }
    });
  }
  return httpClient;
}

/**
 * Push authorization request to PAR endpoint
 *
 * @param {string} parEndpoint - PAR endpoint URL from discovery
 * @param {Object} params - Authorization parameters
 * @param {Object} clientAuth - Client authentication
 * @returns {Promise<Object>} { request_uri, expires_in }
 */
export async function pushAuthorizationRequest(parEndpoint, params, clientAuth) {
  const { clientId, clientSecret, clientAssertion } = clientAuth;

  // Build form data
  const formData = new URLSearchParams();

  // Add authorization parameters
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  });

  // Client authentication
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  if (clientAssertion) {
    // Private Key JWT (client_secret_jwt or private_key_jwt)
    formData.append('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    formData.append('client_assertion', clientAssertion);
    formData.append('client_id', clientId);
  } else if (clientSecret) {
    // Client Secret Basic (Authorization header)
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  } else {
    // Public client
    formData.append('client_id', clientId);
  }

  // Send PAR request
  const client = await getHttpClient();
  const response = await client.post(parEndpoint, {
    headers,
    body: formData.toString()
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'unknown_error' }));
    throw new Error(
      `PAR request failed: ${error.error} - ${error.error_description || 'No description'}`
    );
  }

  const result = await response.json();

  // Validate response
  if (!result.request_uri) {
    throw new Error('PAR response missing request_uri');
  }

  if (!result.expires_in) {
    throw new Error('PAR response missing expires_in');
  }

  return {
    request_uri: result.request_uri,
    expires_in: result.expires_in
  };
}

/**
 * Build authorization URL using PAR request_uri
 *
 * @param {string} authorizationEndpoint - Authorization endpoint URL
 * @param {string} request_uri - Request URI from PAR response
 * @param {string} clientId - Client ID
 * @returns {string} Authorization URL
 */
export function buildPARAuthorizationUrl(authorizationEndpoint, request_uri, clientId) {
  const url = new URL(authorizationEndpoint);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('request_uri', request_uri);
  return url.toString();
}

/**
 * Check if provider supports PAR
 *
 * @param {Object} discoveryDoc - OpenID Discovery document
 * @returns {boolean} True if PAR is supported
 */
export function providerSupportsPAR(discoveryDoc) {
  return !!discoveryDoc.pushed_authorization_request_endpoint;
}

/**
 * Validate PAR configuration
 *
 * @param {Object} config - OIDC configuration
 * @param {Object} discoveryDoc - OpenID Discovery document
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
export function validatePARConfig(config, discoveryDoc) {
  const errors = [];

  if (!providerSupportsPAR(discoveryDoc)) {
    errors.push('Provider does not support PAR (missing pushed_authorization_request_endpoint)');
  }

  if (!config.clientId) {
    errors.push('PAR requires clientId');
  }

  if (!config.clientSecret && !config.clientAssertion) {
    errors.push('PAR requires either clientSecret or clientAssertion for authentication');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : null
  };
}
