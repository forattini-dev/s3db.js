import { SMTPRelayDriver, DriverConfig, DriverOptions } from './relay-driver.js';
export declare function createDriver(driverName: string, config?: DriverConfig, options?: DriverOptions): Promise<SMTPRelayDriver>;
export declare function getAvailableDrivers(): string[];
//# sourceMappingURL=driver-factory.d.ts.map