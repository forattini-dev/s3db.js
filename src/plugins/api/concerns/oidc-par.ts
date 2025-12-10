import { createHttpClient } from '../../../concerns/http-client.js';
import type { HttpClient } from '../../../concerns/http-client.js';

let httpClient: HttpClient | null = null;

async function getHttpClient(): Promise<HttpClient> {
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

export interface ClientAuth {
  clientId: string;
  clientSecret?: string;
  clientAssertion?: string;
}

export interface PARParams {
  [key: string]: string | undefined | null;
}

export interface PARResponse {
  request_uri: string;
  expires_in: number;
}

export interface PARErrorResponse {
  error: string;
  error_description?: string;
}

export interface DiscoveryDocument {
  pushed_authorization_request_endpoint?: string;
  [key: string]: unknown;
}

export interface PARConfig {
  clientId: string;
  clientSecret?: string;
  clientAssertion?: string;
}

export interface PARConfigValidation {
  valid: boolean;
  errors: string[] | null;
}

export async function pushAuthorizationRequest(
  parEndpoint: string,
  params: PARParams,
  clientAuth: ClientAuth
): Promise<PARResponse> {
  const { clientId, clientSecret, clientAssertion } = clientAuth;

  const formData = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  if (clientAssertion) {
    formData.append('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    formData.append('client_assertion', clientAssertion);
    formData.append('client_id', clientId);
  } else if (clientSecret) {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  } else {
    formData.append('client_id', clientId);
  }

  const client = await getHttpClient();
  const response = await client.post(parEndpoint, {
    headers,
    body: formData.toString()
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'unknown_error' })) as PARErrorResponse;
    throw new Error(
      `PAR request failed: ${error.error} - ${error.error_description || 'No description'}`
    );
  }

  const result = await response.json() as PARResponse;

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

export function buildPARAuthorizationUrl(
  authorizationEndpoint: string,
  request_uri: string,
  clientId: string
): string {
  const url = new URL(authorizationEndpoint);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('request_uri', request_uri);
  return url.toString();
}

export function providerSupportsPAR(discoveryDoc: DiscoveryDocument | null): boolean {
  return !!discoveryDoc?.pushed_authorization_request_endpoint;
}

export function validatePARConfig(
  config: PARConfig,
  discoveryDoc: DiscoveryDocument | null
): PARConfigValidation {
  const errors: string[] = [];

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
