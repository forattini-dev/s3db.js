/**
 * SMTP Driver Registry & Loader
 * Provides unified interface for multiple email providers
 */

export { createDriver, getAvailableDrivers } from './driver-factory.js';
export { SMTPRelayDriver } from './relay-driver.js';
export { MultiRelayManager } from './multi-relay.js';
