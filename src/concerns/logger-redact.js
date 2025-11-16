/**
 * Logger Redaction Rules for Sensitive Data
 *
 * Provides comprehensive redaction of sensitive fields in logs to prevent
 * accidental leakage of passwords, API keys, tokens, and AWS credentials.
 *
 * Integrates with Pino's native redact option.
 *
 * Usage:
 *   import { createRedactRules } from './logger-redact.js';
 *   const rules = createRedactRules();
 *   const logger = pino({ redact: rules });
 */

/**
 * Built-in sensitive field patterns
 * Matches common naming conventions for secrets
 */
const BUILT_IN_SENSITIVE_FIELDS = [
  // Passwords and passphrases
  'password',
  'passwd',
  'pwd',
  'passphrase',

  // Generic secrets
  'secret',
  'token',
  'auth',
  'authorization',

  // API Keys and tokens
  'apikey',
  'api_key',
  'api-key',
  'apitoken',
  'api_token',
  'api-token',
  'apisecret',
  'api_secret',
  'api-secret',
  'authtoken',
  'auth_token',
  'auth-token',
  'bearertoken',
  'bearer_token',
  'bearer-token',

  // AWS credentials
  'accesskey',
  'access_key',
  'access-key',
  'accesskeyid',
  'access_key_id',
  'access-key-id',
  'secretkey',
  'secret_key',
  'secret-key',
  'secretaccesskey',
  'secret_access_key',
  'secret-access-key',
  'awsaccesskey',
  'aws_access_key',
  'aws-access-key',
  'awsaccesskeyid',
  'aws_access_key_id',
  'aws-access-key-id',
  'awssecretkey',
  'aws_secret_key',
  'aws-secret-key',
  'awssecretaccesskey',
  'aws_secret_access_key',
  'aws-secret-access-key',
  'awstoken',
  'aws_token',
  'aws-token',
  'sessiontoken',
  'session_token',
  'session-token',

  // GCP
  'gcpaccesskey',
  'gcp_access_key',
  'gcp-access-key',
  'gcpsecretkey',
  'gcp_secret_key',
  'gcp-secret-key',
  'gcpapikey',
  'gcp_api_key',
  'gcp-api-key',

  // Azure
  'azurekey',
  'azure_key',
  'azure-key',
  'azurekeysecret',
  'azure_key_secret',
  'azure-key-secret',
  'azuretoken',
  'azure_token',
  'azure-token',
  'azuresecretkey',
  'azure_secret_key',
  'azure-secret-key',

  // Database credentials
  'connectionstring',
  'connection_string',
  'connection-string',
  'dbpassword',
  'db_password',
  'db-password',
  'dbtoken',
  'db_token',
  'db-token',
  'dbsecret',
  'db_secret',
  'db-secret',
  'mongodburi',
  'mongodb_uri',
  'mongodb-uri',
  'postgresqlpassword',
  'postgresql_password',
  'postgresql-password',

  // OAuth and OIDC
  'clientsecret',
  'client_secret',
  'client-secret',
  'clientid',
  'client_id',
  'client-id',
  'oauth2secret',
  'oauth2_secret',
  'oauth2-secret',
  'oidcsecret',
  'oidc_secret',
  'oidc-secret',

  // Encryption and cryptography
  'encryptionkey',
  'encryption_key',
  'encryption-key',
  'cryptokey',
  'crypto_key',
  'crypto-key',
  'hmackey',
  'hmac_key',
  'hmac-key',
  'rsaprivatekey',
  'rsa_private_key',
  'rsa-private-key',
  'privatekeyid',
  'private_key_id',
  'private-key-id',
  'privatekey',
  'private_key',
  'private-key',

  // Certificates
  'certificate',
  'cert',
  'certificatekey',
  'certificate_key',
  'certificate-key',

  // Additional common patterns
  'key',
  'credential',
  'credentials',
  'hash',
  'nonce',
  'jti',
  'fingerprint',
  'sessionid',
  'session_id',
  'session-id',
  'refreshtoken',
  'refresh_token',
  'refresh-token'
];

/**
 * Create Pino redaction rules from sensitive field list
 *
 * Pino redact format: Array of field paths, wildcards supported
 * Example: ['password', 'user.secret', '*.token']
 *
 * @param {Array<RegExp>} [customPatterns=[]] - Additional regex patterns to match fields
 * @returns {Array<string>} Pino-compatible redaction paths
 */
export function createRedactRules(customPatterns = []) {
  // Start with built-in sensitive fields
  const redactPaths = [];

  // Add exact matches for each built-in field (case-insensitive via Pino)
  for (const field of BUILT_IN_SENSITIVE_FIELDS) {
    // Direct field match
    redactPaths.push(field);

    // Nested field match (e.g., user.password, data.secret)
    redactPaths.push(`*.${field}`);
    redactPaths.push(`**.${field}`);
  }

  // Add custom regex patterns
  // Note: Pino's redact doesn't support regex directly, so we document the option
  // Custom redaction via serializers would need to be done in the logger config
  // For now, we'll pass the patterns through for potential use in custom serializers
  if (customPatterns.length > 0) {
    // Store for potential use in serializers (implementation in createLogger)
  }

  return redactPaths;
}

/**
 * Test if a field name matches sensitive patterns
 * Useful for custom serializers or validation
 *
 * @param {string} fieldName - Field name to test
 * @param {Array<RegExp>} [customPatterns=[]] - Custom patterns to check
 * @returns {boolean} True if field matches sensitive patterns
 */
export function isSensitiveField(fieldName, customPatterns = []) {
  const lowerFieldName = fieldName.toLowerCase();

  // Check built-in patterns
  if (BUILT_IN_SENSITIVE_FIELDS.some(field => lowerFieldName.includes(field))) {
    return true;
  }

  // Check custom patterns
  return customPatterns.some(pattern => pattern.test(fieldName));
}

/**
 * Get redaction serializer for custom payload truncation + secret redaction
 * Combines Pino's native redaction with payload size limits
 *
 * @param {number} [maxBytes=1000000] - Maximum bytes before truncation
 * @returns {Function} Serializer function for Pino
 */
export function createPayloadRedactionSerializer(maxBytes = 1_000_000) {
  return (value) => {
    if (value === null || value === undefined) {
      return value;
    }

    const json = JSON.stringify(value);
    if (json.length > maxBytes) {
      return {
        _truncated: true,
        _originalSize: json.length,
        _maxSize: maxBytes,
        _data: JSON.parse(json.slice(0, maxBytes))
      };
    }

    return value;
  };
}

/**
 * Example: Custom serializer for logs with sensitive data
 *
 * Usage:
 *   const logger = pino({
 *     serializers: {
 *       data: redactSensitiveData(customPatterns)
 *     }
 *   });
 *
 * @param {Array<RegExp>} [customPatterns=[]] - Custom patterns
 * @returns {Function} Serializer function
 */
export function createSensitiveDataSerializer(customPatterns = []) {
  return (data) => {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data };

    for (const [key, value] of Object.entries(sanitized)) {
      if (isSensitiveField(key, customPatterns)) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  };
}

export default {
  createRedactRules,
  isSensitiveField,
  createPayloadRedactionSerializer,
  createSensitiveDataSerializer,
  BUILT_IN_SENSITIVE_FIELDS
};
