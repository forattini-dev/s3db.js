import { SMTPRelayDriver } from './relay-driver.js';
const DRIVER_REGISTRY = {
    'smtp': SMTPRelayDriver,
    'sendgrid': SMTPRelayDriver,
    'aws-ses': SMTPRelayDriver,
    'mailgun': SMTPRelayDriver,
    'postmark': SMTPRelayDriver,
    'gmail': SMTPRelayDriver
};
export async function createDriver(driverName, config = {}, options = {}) {
    if (!driverName) {
        throw new Error('Driver name is required');
    }
    const DriverClass = DRIVER_REGISTRY[driverName];
    if (!DriverClass) {
        throw new Error(`Unknown SMTP driver: "${driverName}". Available drivers: ${Object.keys(DRIVER_REGISTRY).join(', ')}`);
    }
    const driver = new DriverClass(driverName, config, options);
    await driver.initialize();
    return driver;
}
export function getAvailableDrivers() {
    return Object.keys(DRIVER_REGISTRY);
}
//# sourceMappingURL=driver-factory.js.map