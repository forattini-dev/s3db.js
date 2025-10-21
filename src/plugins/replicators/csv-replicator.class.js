import { BaseReplicator } from './base-replicator.class.js';
import { ReplicationError } from '../replicator.errors.js';
import { OutputDriverFactory } from '../concerns/output-drivers.js';

/**
 * CSV File Replicator
 *
 * Exports S3DB data to CSV files with flexible output destinations.
 *
 * === Features ===
 * ✅ Export to S3 (default/custom) or filesystem
 * ✅ Automatic header generation
 * ✅ Quoted fields for strings with commas
 * ✅ Custom delimiter support (comma, semicolon, tab, pipe)
 * ✅ Append or overwrite modes
 * ✅ File rotation by date or size
 * ✅ Memory-efficient streaming
 *
 * === Configuration Examples ===
 *
 * **S3 Default (PluginStorage)**:
 * ```javascript
 * {
 *   driver: 'csv',
 *   resources: ['users', 'orders'],
 *   config: {
 *     output: {
 *       driver: 's3',           // Uses database's PluginStorage
 *       path: 'exports/csv'     // Relative to plugin storage
 *     },
 *     delimiter: ',',
 *     rotateBy: 'date'
 *   }
 * }
 * ```
 *
 * **S3 Custom (External Bucket)**:
 * ```javascript
 * {
 *   driver: 'csv',
 *   resources: ['users', 'orders'],
 *   config: {
 *     output: {
 *       driver: 's3',
 *       connectionString: 's3://KEY:SECRET@analytics-bucket/csv-exports',
 *       path: 'daily'
 *     }
 *   }
 * }
 * ```
 *
 * **Filesystem**:
 * ```javascript
 * {
 *   driver: 'csv',
 *   resources: ['users', 'orders'],
 *   config: {
 *     output: {
 *       driver: 'filesystem',
 *       path: './exports/csv'
 *     }
 *   }
 * }
 * ```
 *
 * === Output Format ===
 * Files: `{resource}_{timestamp}.csv`
 * Example: `users_2025-10-20.csv`
 *
 * === Performance ===
 * - Streaming writes (memory-efficient)
 * - Batch operations
 * - No full dataset loading
 */
export class CsvReplicator extends BaseReplicator {
  constructor(config = {}) {
    super(config);

    // Output configuration
    this.outputConfig = config.output || { driver: 's3', path: 'exports' };

    // CSV options
    this.delimiter = config.delimiter || ',';
    this.mode = config.mode || 'append'; // 'append' or 'overwrite'
    this.includeHeaders = config.includeHeaders !== false;
    this.rotateBy = config.rotateBy || null; // 'date', 'size', or null
    this.rotateSize = config.rotateSize || 100 * 1024 * 1024; // 100MB
    this.encoding = config.encoding || 'utf8';

    // Track headers written per resource
    this.writtenHeaders = new Set();

    // Output driver (initialized in initialize())
    this.outputDriver = null;

    // Statistics
    this.stats = {
      recordsWritten: 0,
      filesCreated: 0,
      bytesWritten: 0,
      errors: 0
    };
  }

  /**
   * Initialize replicator
   */
  async initialize(database) {
    await super.initialize(database);

    // Create output driver
    this.outputDriver = OutputDriverFactory.create({
      ...this.outputConfig,
      pluginStorage: this.pluginStorage // Pass PluginStorage for default S3
    });

    if (this.verbose) {
      console.log(`[CsvReplicator] Initialized with ${this.outputConfig.driver} output`);
      if (this.outputConfig.connectionString) {
        console.log(`[CsvReplicator] Using custom S3: ${this.outputConfig.connectionString.split('@')[1]}`);
      }
    }
  }

  /**
   * Replicate a single record
   */
  async replicate(resourceName, operation, data, id) {
    // Skip deletes (CSV doesn't support deletions)
    if (operation === 'delete') {
      return {
        success: true,
        skipped: true,
        reason: 'CSV format does not support delete operations'
      };
    }

    try {
      // Get or create file path
      const filePath = this._getFilePath(resourceName);

      // Write header if needed
      if (!this.writtenHeaders.has(filePath)) {
        await this._writeHeader(filePath, data);
        this.writtenHeaders.add(filePath);
      }

      // Convert record to CSV line
      const csvLine = this._recordToCsvLine(data);

      // Write to file
      await this.outputDriver.append(filePath, csvLine + '\n', {
        encoding: this.encoding
      });

      // Update stats
      this.stats.recordsWritten++;
      this.stats.bytesWritten += Buffer.byteLength(csvLine, this.encoding);

      // Check file rotation
      if (this.rotateBy === 'size') {
        await this._checkRotation(resourceName, filePath);
      }

      return {
        success: true,
        resourceName,
        id,
        operation,
        filePath,
        stats: { ...this.stats }
      };
    } catch (error) {
      this.stats.errors++;

      throw new ReplicationError(
        `Failed to replicate to CSV: ${error.message}`,
        {
          driver: 'csv',
          resourceName,
          operation,
          id,
          outputDriver: this.outputConfig.driver,
          original: error,
          suggestion: 'Check output driver configuration and permissions'
        }
      );
    }
  }

  /**
   * Get file path for resource
   */
  _getFilePath(resourceName) {
    if (this.rotateBy === 'date') {
      // Rotate by date: users_2025-10-20.csv
      const date = new Date().toISOString().split('T')[0];
      return `${resourceName}_${date}.csv`;
    } else if (this.rotateBy === 'size') {
      // Rotate by size: users.csv (will be renamed when rotated)
      return `${resourceName}.csv`;
    } else {
      // No rotation: users.csv
      return `${resourceName}.csv`;
    }
  }

  /**
   * Write CSV header
   */
  async _writeHeader(filePath, data) {
    if (!this.includeHeaders) return;

    // Get sorted column names
    const columns = Object.keys(data).sort();

    // Create header line
    const header = columns.join(this.delimiter);

    // Check if file exists and has content
    const exists = await this.outputDriver.exists(filePath);

    if (!exists || this.mode === 'overwrite') {
      // New file or overwrite mode - write header
      await this.outputDriver.write(filePath, header + '\n', {
        encoding: this.encoding
      });
      this.stats.filesCreated++;
    }
  }

  /**
   * Convert record to CSV line
   */
  _recordToCsvLine(data) {
    // Get sorted column names
    const columns = Object.keys(data).sort();

    // Map values and escape
    const values = columns.map(col => {
      const value = data[col];
      return this._escapeCsvField(value);
    });

    return values.join(this.delimiter);
  }

  /**
   * Escape CSV field value
   */
  _escapeCsvField(value) {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return '';
    }

    // Convert to string
    let str = String(value);

    // Check if needs quoting
    const needsQuoting =
      str.includes(this.delimiter) ||
      str.includes('\n') ||
      str.includes('\r') ||
      str.includes('"');

    if (needsQuoting) {
      // Escape quotes by doubling them
      str = str.replace(/"/g, '""');
      // Wrap in quotes
      return `"${str}"`;
    }

    return str;
  }

  /**
   * Check if file needs rotation
   */
  async _checkRotation(resourceName, filePath) {
    const size = await this.outputDriver.size(filePath);

    if (size >= this.rotateSize) {
      // Rotate file
      const timestamp = Date.now();
      const newPath = `${resourceName}_${timestamp}.csv`;

      // Read current content
      const content = await this.outputDriver.read(filePath);

      // Write to new file
      if (content) {
        await this.outputDriver.write(newPath, content, {
          encoding: this.encoding
        });
      }

      // Delete old file
      await this.outputDriver.delete(filePath);

      // Reset header tracking
      this.writtenHeaders.delete(filePath);

      if (this.verbose) {
        console.log(`[CsvReplicator] Rotated ${filePath} → ${newPath} (${size} bytes)`);
      }
    }
  }

  /**
   * Get replicator statistics
   */
  getStats() {
    return {
      ...this.stats,
      outputDriver: this.outputConfig.driver,
      outputPath: this.outputConfig.path
    };
  }

  /**
   * Cleanup on uninstall
   */
  async uninstall(database) {
    if (this.verbose) {
      console.log('[CsvReplicator] Cleaning up...');
    }

    // Note: We don't auto-delete files on uninstall
    // Users should manually delete if needed

    await super.uninstall(database);
  }
}

export default CsvReplicator;
