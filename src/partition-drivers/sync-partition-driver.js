import { BasePartitionDriver } from './base-partition-driver.js';

/**
 * Synchronous partition driver
 * Creates partitions immediately during insert/update/delete
 * Use this when data consistency is critical
 */
export class SyncPartitionDriver extends BasePartitionDriver {
  constructor(options = {}) {
    super(options);
    this.name = 'sync';
  }

  /**
   * Process partition operations synchronously
   */
  async queue(operation) {
    this.stats.queued++;
    
    try {
      // Process immediately and wait for completion
      await this.processOperation(operation);
      return { success: true, driver: 'sync' };
    } catch (error) {
      // Re-throw to make the main operation fail
      throw error;
    }
  }

  getInfo() {
    return {
      name: this.name,
      mode: 'synchronous',
      description: 'Processes partitions immediately, blocking the main operation',
      stats: this.getStats()
    };
  }
}