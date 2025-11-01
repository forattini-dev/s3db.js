import { PluginError } from '../../../errors.js';

export class AuthDriver {
  constructor(name, supportedTypes = []) {
    this.name = name;
    this.supportedTypes = supportedTypes;
  }

  /**
   * Called once during plugin initialization with database/config/resources
   * @param {Object} context
   */
  // eslint-disable-next-line no-unused-vars
  async initialize(context) {
    throw new PluginError('AuthDriver.initialize(context) must be implemented by subclasses', {
      pluginName: 'IdentityPlugin',
      operation: 'initializeDriver',
      statusCode: 500,
      retriable: false,
      suggestion: `Implement initialize(context) in ${this.constructor.name} or use one of the provided drivers.`
    });
  }

  /**
   * Authenticate a request (password, client credentials, etc)
   * @param {Object} request
   */
  // eslint-disable-next-line no-unused-vars
  async authenticate(request) {
    throw new PluginError('AuthDriver.authenticate(request) must be implemented by subclasses', {
      pluginName: 'IdentityPlugin',
      operation: 'authenticateDriver',
      statusCode: 500,
      retriable: false,
      suggestion: `Implement authenticate(request) in ${this.constructor.name} to support the configured grant type.`
    });
  }

  supportsType(type) {
    if (!type) return false;
    return this.supportedTypes.includes(type);
  }

  /**
   * Whether the driver supports issuing tokens for the given grant type
   * @param {string} grantType
   */
  // eslint-disable-next-line no-unused-vars
  supportsGrant(grantType) {
    return false;
  }

  /**
   * Optionally issue tokens (if driver is responsible for it)
   * @param {Object} payload
   */
  // eslint-disable-next-line no-unused-vars
  async issueTokens(payload) {
    throw new PluginError(`AuthDriver ${this.name} does not implement issueTokens`, {
      pluginName: 'IdentityPlugin',
      operation: 'issueTokens',
      statusCode: 500,
      retriable: false,
      suggestion: 'Provide an issueTokens implementation or delegate token issuance to the OAuth2 server.'
    });
  }

  /**
   * Optionally revoke tokens (if driver manages them)
   * @param {Object} payload
   */
  // eslint-disable-next-line no-unused-vars
  async revokeTokens(payload) {
    return;
  }
}
