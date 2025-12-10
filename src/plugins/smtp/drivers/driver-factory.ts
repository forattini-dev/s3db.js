import { SMTPRelayDriver, DriverConfig, DriverOptions } from './relay-driver.js';

type DriverClass = typeof SMTPRelayDriver;

const DRIVER_REGISTRY: Record<string, DriverClass> = {
  'smtp': SMTPRelayDriver,
  'sendgrid': SMTPRelayDriver,
  'aws-ses': SMTPRelayDriver,
  'mailgun': SMTPRelayDriver,
  'postmark': SMTPRelayDriver,
  'gmail': SMTPRelayDriver
};

export async function createDriver(
  driverName: string,
  config: DriverConfig = {},
  options: DriverOptions = {}
): Promise<SMTPRelayDriver> {
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

export function getAvailableDrivers(): string[] {
  return Object.keys(DRIVER_REGISTRY);
}
