const BUILT_IN_SENSITIVE_FIELDS = [
    'password',
    'passwd',
    'pwd',
    'passphrase',
    'secret',
    'token',
    'auth',
    'authorization',
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
    'gcpaccesskey',
    'gcp_access_key',
    'gcp-access-key',
    'gcpsecretkey',
    'gcp_secret_key',
    'gcp-secret-key',
    'gcpapikey',
    'gcp_api_key',
    'gcp-api-key',
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
    'certificate',
    'cert',
    'certificatekey',
    'certificate_key',
    'certificate-key',
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
export function createRedactRules(customPatterns = []) {
    const redactPaths = [];
    for (const field of BUILT_IN_SENSITIVE_FIELDS) {
        redactPaths.push(field);
        redactPaths.push(`*.${field}`);
        redactPaths.push(`**.${field}`);
    }
    if (customPatterns.length > 0) {
        // Store for potential use in serializers (implementation in createLogger)
    }
    return redactPaths;
}
export function isSensitiveField(fieldName, customPatterns = []) {
    const lowerFieldName = fieldName.toLowerCase();
    if (BUILT_IN_SENSITIVE_FIELDS.some(field => lowerFieldName.includes(field))) {
        return true;
    }
    return customPatterns.some(pattern => pattern.test(fieldName));
}
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
export { BUILT_IN_SENSITIVE_FIELDS };
//# sourceMappingURL=logger-redact.js.map