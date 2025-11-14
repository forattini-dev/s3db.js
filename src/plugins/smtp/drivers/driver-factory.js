/**
 * SMTP Driver Factory
 * Creates appropriate driver based on driver name and config
 */

import { SMTPRelayDriver } from './relay-driver.js';

const DRIVER_REGISTRY = {
  'smtp': SMTPRelayDriver,
  'sendgrid': SMTPRelayDriver,
  'aws-ses': SMTPRelayDriver,
  'mailgun': SMTPRelayDriver,
  'postmark': SMTPRelayDriver,
  'gmail': SMTPRelayDriver
};

/**
 * Create an SMTP driver instance
 * @param {string} driverName - Driver name: 'smtp', 'sendgrid', 'aws-ses', 'mailgun', 'postmark', 'gmail'
 * @param {Object} config - Driver-specific configuration
 * @param {Object} options - Plugin options (from, emailResource, etc.)
 * @returns {Object} Driver instance
 */
export async function createDriver(driverName, config = {}, options = {}) {
  if (!driverName) {
    throw new Error('Driver name is required');
  }

  const DriverClass = DRIVER_REGISTRY[driverName];
  if (!DriverClass) {
    throw new Error(
      `Unknown SMTP driver: "${driverName}". Available drivers: ${Object.keys(DRIVER_REGISTRY).join(', ')}`
    );
  }

  const driver = new DriverClass(driverName, config, options);
  await driver.initialize();
  return driver;
}

/**
 * Get list of available drivers
 */
export function getAvailableDrivers() {
  return Object.keys(DRIVER_REGISTRY);
}
