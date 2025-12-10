/**
 * Base Authentication Driver Interface
 *
 * Abstract base class for authentication drivers in the Identity Plugin.
 * All auth drivers must extend this class and implement the required methods.
 */
import { PluginError } from '../../../errors.js';
export class AuthDriver {
    name;
    supportedTypes;
    constructor(name, supportedTypes = []) {
        this.name = name;
        this.supportedTypes = supportedTypes;
    }
    async initialize(_context) {
        throw new PluginError('AuthDriver.initialize(context) must be implemented by subclasses', {
            pluginName: 'IdentityPlugin',
            operation: 'initializeDriver',
            statusCode: 500,
            retriable: false,
            suggestion: `Implement initialize(context) in ${this.constructor.name} or use one of the provided drivers.`
        });
    }
    async authenticate(_request) {
        throw new PluginError('AuthDriver.authenticate(request) must be implemented by subclasses', {
            pluginName: 'IdentityPlugin',
            operation: 'authenticateDriver',
            statusCode: 500,
            retriable: false,
            suggestion: `Implement authenticate(request) in ${this.constructor.name} to support the configured grant type.`
        });
    }
    supportsType(type) {
        if (!type)
            return false;
        return this.supportedTypes.includes(type);
    }
    supportsGrant(_grantType) {
        return false;
    }
    async issueTokens(_payload) {
        throw new PluginError(`AuthDriver ${this.name} does not implement issueTokens`, {
            pluginName: 'IdentityPlugin',
            operation: 'issueTokens',
            statusCode: 500,
            retriable: false,
            suggestion: 'Provide an issueTokens implementation or delegate token issuance to the OAuth2 server.'
        });
    }
    async revokeTokens(_payload) {
        return;
    }
}
//# sourceMappingURL=auth-driver.interface.js.map