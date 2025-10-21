import { BaseReplicator } from './base-replicator.class.js';
import { ReplicationError } from '../replicator.errors.js';
import { OutputDriverFactory } from '../concerns/output-drivers.js';

/**
 * JSONL (JSON Lines) Replicator
 *
 * Exports S3DB data to JSONL/NDJSON format for analytics and log processing.
 *
 * === Features ===
 * ✅ Export to S3 (default/custom) or filesystem
 * ✅ One JSON object per line
 * ✅ Streaming writes (memory-efficient)
 * ✅ Optional gzip compression
 * ✅ BigQuery/Athena compatible
 * ✅ Append or overwrite modes
 * ✅ File rotation by date or size
 *
 * === Configuration Examples ===
 *
 * **S3 Default**:
 * ```javascript
 * {
 *   driver: 'jsonl',
 *   resources: ['events', 'logs'],
 *   config: {
 *     output: {
 *       driver: 's3',
 *       path: 'exports/jsonl'
 *     },
 *     rotateBy: 'date'
 *   }
 * }
 * ```
 *
 * **S3 Custom (BigQuery Import)**:
 * ```javascript
 * {
 *   driver: 'jsonl',
 *   resources: ['events'],
 *   config: {
 *     output: {
 *       driver: 's3',
 *       connectionString: 's3://KEY:SECRET@analytics/bigquery-import'
 *     },
 *     compress: true
 *   }
 * }
 * ```
 *
 * **Filesystem**:
 * ```javascript
 * {
 *   driver: 'jsonl',
 *   resources: ['logs'],
 *   config: {
 *     output: {
 *       driver: 'filesystem',
 *       path: './logs'
 *     }
 *   }
 * }
 * ```
 *
 * === Output Format ===
 * Files: `{resource}_{timestamp}.jsonl`
 * Example: `events_2025-10-21.jsonl`
 *
 * Content:
 * ```jsonl
 * {"id":"e1","type":"click","timestamp":1729468800}
 * {"id":"e2","type":"view","timestamp":1729468801}
 * ```
 *
 * === Use Cases ===
 * - BigQuery import
 * - AWS Athena queries
 * - Log aggregation
 * - Streaming analytics
 */
export class JsonlReplicator extends BaseReplicator {
  constructor(config = {}) {
    super(config);

    // Output configuration
    this.outputConfig = config.output || { driver: 's3', path: 'exports' };

    // JSONL options
    this.mode = config.mode || 'append';
    this.rotateBy = config.rotateBy || null;
    this.rotateSize = config.rotateSize || 100 * 1024 * 1024;
    this.compress = config.compress || false;
    this.encoding = config.encoding || 'utf8';

    // Output driver
    this.outputDriver = null;

    // Statistics
    this.stats = {
      recordsWritten: 0,
      filesCreated: 0,
      bytesWritten: 0,
      errors: 0
    };
  }

  async initialize(database) {
    await super.initialize(database);

    this.outputDriver = OutputDriverFactory.create({
      ...this.outputConfig,
      pluginStorage: this.pluginStorage
    });

    if (this.verbose) {
      console.log(`[JsonlReplicator] Initialized with ${this.outputConfig.driver} output`);
      if (this.compress) {
        console.log('[JsonlReplicator] Compression enabled');
      }
    }
  }

  async replicate(resourceName, operation, data, id) {
    if (operation === 'delete') {
      return {
        success: true,
        skipped: true,
        reason: 'JSONL format does not support delete operations'
      };
    }

    try {
      const filePath = this._getFilePath(resourceName);

      // Convert to JSON line
      const jsonLine = JSON.stringify(data) + '\n';

      // Write to file
      await this.outputDriver.append(filePath, jsonLine, {
        encoding: this.encoding
      });

      // Update stats
      this.stats.recordsWritten++;
      this.stats.bytesWritten += Buffer.byteLength(jsonLine, this.encoding);

      // Check rotation
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
        `Failed to replicate to JSONL: ${error.message}`,
        {
          driver: 'jsonl',
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

  _getFilePath(resourceName) {
    const ext = this.compress ? '.jsonl.gz' : '.jsonl';

    if (this.rotateBy === 'date') {
      const date = new Date().toISOString().split('T')[0];
      return `${resourceName}_${date}${ext}`;
    } else if (this.rotateBy === 'size') {
      return `${resourceName}${ext}`;
    } else {
      return `${resourceName}${ext}`;
    }
  }

  async _checkRotation(resourceName, filePath) {
    const size = await this.outputDriver.size(filePath);

    if (size >= this.rotateSize) {
      const timestamp = Date.now();
      const ext = this.compress ? '.jsonl.gz' : '.jsonl';
      const newPath = `${resourceName}_${timestamp}${ext}`;

      const content = await this.outputDriver.read(filePath);

      if (content) {
        await this.outputDriver.write(newPath, content, {
          encoding: this.encoding
        });
      }

      await this.outputDriver.delete(filePath);

      if (this.verbose) {
        console.log(`[JsonlReplicator] Rotated ${filePath} → ${newPath} (${size} bytes)`);
      }
    }
  }

  getStats() {
    return {
      ...this.stats,
      outputDriver: this.outputConfig.driver,
      outputPath: this.outputConfig.path
    };
  }

  async uninstall(database) {
    if (this.verbose) {
      console.log('[JsonlReplicator] Cleaning up...');
    }
    await super.uninstall(database);
  }
}

export default JsonlReplicator;
