import { SyncPartitionDriver } from './sync-partition-driver.js';
import { MemoryPartitionDriver } from './memory-partition-driver.js';
import { SQSPartitionDriver } from './sqs-partition-driver.js';
import { PartitionDriverError } from '../errors.js';

/**
 * Partition driver factory
 */
export class PartitionDriverFactory {
  static drivers = {
    sync: SyncPartitionDriver,
    memory: MemoryPartitionDriver,
    sqs: SQSPartitionDriver
  };

  /**
   * Create a partition driver instance
   * @param {string|Object} config - Driver name or configuration object
   * @returns {BasePartitionDriver} Driver instance
   */
  static create(config) {
    // Handle string shorthand
    if (typeof config === 'string') {
      config = { driver: config };
    }
    
    // Default to memory driver
    const driverName = config.driver || 'memory';
    
    // Get driver class
    const DriverClass = this.drivers[driverName];
    if (!DriverClass) {
      throw new PartitionDriverError(`Unknown partition driver: ${driverName}`, {
        driver: driverName,
        operation: 'create',
        availableDrivers: Object.keys(this.drivers),
        suggestion: `Use one of the available drivers: ${Object.keys(this.drivers).join(', ')}, or register a custom driver`
      });
    }
    
    // Create and initialize driver
    const driver = new DriverClass(config);
    
    return driver;
  }

  /**
   * Register a custom driver
   */
  static register(name, DriverClass) {
    this.drivers[name] = DriverClass;
  }

  /**
   * Get available driver names
   */
  static getAvailableDrivers() {
    return Object.keys(this.drivers);
  }
}

// Export individual drivers
export { BasePartitionDriver } from './base-partition-driver.js';
export { SyncPartitionDriver } from './sync-partition-driver.js';
export { MemoryPartitionDriver } from './memory-partition-driver.js';
export { SQSPartitionDriver } from './sqs-partition-driver.js';