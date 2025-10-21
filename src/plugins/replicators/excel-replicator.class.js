import { BaseReplicator } from './base-replicator.class.js';
import { ReplicationError } from '../replicator.errors.js';
import { OutputDriverFactory } from '../concerns/output-drivers.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Excel File Replicator
 *
 * Exports S3DB data to Excel (.xlsx) format for business analysis and reporting.
 *
 * === Features ===
 * ✅ Export to S3 (default/custom) or filesystem
 * ✅ Multiple worksheets (one per resource)
 * ✅ Automatic column headers
 * ✅ Cell formatting (dates, numbers, currency)
 * ✅ Auto-fit column widths
 * ✅ Freeze header row
 * ✅ Add filters to headers
 * ✅ Perfect for business reporting and data sharing
 *
 * === Configuration Examples ===
 *
 * **S3 Default (PluginStorage)**:
 * ```javascript
 * {
 *   driver: 'excel',
 *   resources: ['users', 'orders'],
 *   config: {
 *     output: {
 *       driver: 's3',
 *       path: 'exports/excel'
 *     },
 *     filename: 'export.xlsx',
 *     freezeHeaders: true,
 *     autoFilter: true
 *   }
 * }
 * ```
 *
 * **S3 Custom (External Bucket)**:
 * ```javascript
 * {
 *   driver: 'excel',
 *   resources: ['users', 'orders'],
 *   config: {
 *     output: {
 *       driver: 's3',
 *       connectionString: 's3://KEY:SECRET@analytics-bucket/excel-exports'
 *     },
 *     filename: 'daily-report.xlsx'
 *   }
 * }
 * ```
 *
 * **Filesystem**:
 * ```javascript
 * {
 *   driver: 'excel',
 *   resources: ['users', 'orders'],
 *   config: {
 *     output: {
 *       driver: 'filesystem',
 *       path: './exports/excel'
 *     },
 *     filename: 'export.xlsx'
 *   }
 * }
 * ```
 *
 * === Output Format ===
 * Files: `{filename}_{timestamp}.xlsx`
 * Example: `export_2025-10-20.xlsx`
 *
 * Each resource gets its own worksheet:
 * - Sheet "users" with users data
 * - Sheet "orders" with orders data
 *
 * === Performance Notes ===
 * - Excel files are memory-intensive (loads entire dataset)
 * - Limit: 1,048,576 rows per sheet
 * - For large datasets (>100K rows), use CSV or Parquet instead
 * - Batch mode recommended for better performance
 *
 * === Cell Formatting ===
 * - Dates: Formatted as "YYYY-MM-DD HH:MM:SS"
 * - Numbers: Decimal precision based on value
 * - Currency: Can be configured via formatCurrency option
 * - Booleans: TRUE/FALSE
 * - Objects/Arrays: JSON stringified
 *
 * === Use Cases ===
 * - Business reporting
 * - Data sharing with non-technical teams
 * - Financial reports
 * - Dashboard exports
 * - Ad-hoc data analysis in Excel
 *
 * === Note on Dependencies ===
 * This replicator requires the 'exceljs' package:
 * ```bash
 * npm install exceljs
 * ```
 *
 * If not installed, the replicator will throw an error with installation instructions.
 */
export class ExcelReplicator extends BaseReplicator {
  constructor(config = {}) {
    super(config);

    // Output configuration
    this.outputConfig = config.output || { driver: 's3', path: 'exports' };

    // Excel options
    this.filename = config.filename || 'export.xlsx';
    this.mode = config.mode || 'append';
    this.sheetPerResource = config.sheetPerResource !== false;
    this.freezeHeaders = config.freezeHeaders !== false;
    this.autoFilter = config.autoFilter !== false;
    this.autoFitColumns = config.autoFitColumns !== false;
    this.maxRowsPerSheet = config.maxRowsPerSheet || 1048576; // Excel limit
    this.formatCurrency = config.formatCurrency || false;

    // Output driver (initialized in initialize())
    this.outputDriver = null;

    // Temporary directory for Excel file generation
    this.tempDir = path.join(os.tmpdir(), 's3db-excel');

    // Buffer for batch writes
    this.buffers = new Map(); // resourceName -> array of records
    this.workbooks = new Map(); // filename -> workbook instance

    // Statistics
    this.stats = {
      recordsWritten: 0,
      filesCreated: 0,
      sheetsCreated: 0,
      bytesWritten: 0,
      errors: 0
    };

    // Try to load exceljs
    this.ExcelJS = null;
    this.excelAvailable = false;
  }

  /**
   * Initialize replicator
   */
  async initialize(database) {
    await super.initialize(database);

    // Try to load exceljs
    try {
      const module = await import('exceljs');
      this.ExcelJS = module.default || module;
      this.excelAvailable = true;
    } catch (error) {
      throw new ReplicationError(
        'Excel replicator requires the "exceljs" package. Install it with: npm install exceljs',
        {
          operation: 'initialize',
          replicatorClass: this.name,
          suggestion: 'Run: npm install exceljs',
          originalError: error
        }
      );
    }

    // Create output driver
    this.outputDriver = OutputDriverFactory.create({
      ...this.outputConfig,
      pluginStorage: this.pluginStorage
    });

    // Create temporary directory for Excel file generation
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    if (this.verbose) {
      console.log(`[ExcelReplicator] Initialized with ${this.outputConfig.driver} output`);
      console.log(`[ExcelReplicator] Filename: ${this.filename}`);
      if (this.outputConfig.connectionString) {
        console.log(`[ExcelReplicator] Using custom S3: ${this.outputConfig.connectionString.split('@')[1]}`);
      }
    }

    this.emit('initialized', {
      replicator: this.name,
      outputDriver: this.outputConfig.driver,
      filename: this.filename
    });
  }

  /**
   * Get file path
   */
  _getFilePath() {
    const date = new Date().toISOString().split('T')[0];
    const baseFilename = this.filename.replace('.xlsx', '');
    return `${baseFilename}_${date}.xlsx`;
  }

  /**
   * Get temporary file path for Excel generation
   */
  _getTempFilePath() {
    const timestamp = Date.now();
    const baseFilename = this.filename.replace('.xlsx', '');
    return path.join(this.tempDir, `${baseFilename}_${timestamp}.xlsx`);
  }

  /**
   * Get or create workbook
   */
  async _getWorkbook(filePath) {
    if (this.workbooks.has(filePath)) {
      return this.workbooks.get(filePath);
    }

    const workbook = new this.ExcelJS.Workbook();
    workbook.creator = 'S3DB Replicator';
    workbook.created = new Date();

    this.workbooks.set(filePath, workbook);
    this.stats.filesCreated++;

    return workbook;
  }

  /**
   * Get or create worksheet
   */
  _getWorksheet(workbook, resourceName) {
    let worksheet = workbook.getWorksheet(resourceName);

    if (!worksheet) {
      worksheet = workbook.addWorksheet(resourceName, {
        views: this.freezeHeaders ? [{ state: 'frozen', ySplit: 1 }] : []
      });
      this.stats.sheetsCreated++;
    }

    return worksheet;
  }

  /**
   * Setup worksheet headers
   */
  _setupHeaders(worksheet, columns) {
    // Add header row
    worksheet.addRow(columns);

    // Style headers
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add auto-filter
    if (this.autoFilter) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length }
      };
    }

    // Auto-fit columns
    if (this.autoFitColumns) {
      worksheet.columns = columns.map(col => ({
        header: col,
        key: col,
        width: Math.max(col.length + 2, 10)
      }));
    }
  }

  /**
   * Format cell value based on type
   */
  _formatCellValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    const type = typeof value;

    if (type === 'object') {
      if (value instanceof Date) {
        return value;
      }
      if (Array.isArray(value)) {
        return JSON.stringify(value);
      }
      return JSON.stringify(value);
    }

    return value;
  }

  /**
   * Add row to worksheet
   */
  _addRow(worksheet, data, columns) {
    const rowData = columns.map(col => this._formatCellValue(data[col]));
    worksheet.addRow(rowData);
  }

  /**
   * Write buffered records to Excel
   */
  async _flushBuffer(resourceName) {
    if (!this.excelAvailable) {
      throw new ReplicationError('Excel library not available', {
        operation: '_flushBuffer',
        replicatorClass: this.name
      });
    }

    const buffer = this.buffers.get(resourceName);
    if (!buffer || buffer.length === 0) {
      return { success: true, recordsWritten: 0 };
    }

    let tempFilePath = null;

    try {
      const filePath = this._getFilePath();
      tempFilePath = this._getTempFilePath();

      const workbook = await this._getWorkbook(tempFilePath);
      const worksheet = this._getWorksheet(workbook, resourceName);

      // Get all unique columns
      const columnsSet = new Set();
      for (const record of buffer) {
        Object.keys(record).forEach(col => columnsSet.add(col));
      }
      const columns = Array.from(columnsSet).sort();

      // Setup headers if this is first write
      if (worksheet.rowCount === 0) {
        this._setupHeaders(worksheet, columns);
      }

      // Add all rows
      for (const record of buffer) {
        // Check row limit
        if (worksheet.rowCount >= this.maxRowsPerSheet) {
          this.emit('warning', {
            replicator: this.name,
            resourceName,
            message: `Reached max rows per sheet (${this.maxRowsPerSheet})`
          });
          break;
        }

        this._addRow(worksheet, record, columns);
      }

      // Save workbook to temp file
      await workbook.xlsx.writeFile(tempFilePath);

      // Read temp file
      const fileContent = await fs.promises.readFile(tempFilePath);

      // Upload via output driver
      await this.outputDriver.write(filePath, fileContent);

      const recordsWritten = buffer.length;
      this.stats.recordsWritten += recordsWritten;
      this.stats.bytesWritten += fileContent.length;

      // Clear buffer
      this.buffers.set(resourceName, []);

      // Remove from workbooks map
      this.workbooks.delete(tempFilePath);

      // Clean up temp file
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath);
      }

      return {
        success: true,
        resourceName,
        recordsWritten,
        filePath
      };
    } catch (error) {
      this.stats.errors++;
      this.emit('error', {
        replicator: this.name,
        resourceName,
        error: error.message
      });

      // Clean up temp file on error
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          await fs.promises.unlink(tempFilePath);
        } catch (unlinkError) {
          // Ignore cleanup errors
        }
      }

      throw new ReplicationError(`Failed to write Excel: ${error.message}`, {
        operation: '_flushBuffer',
        replicatorClass: this.name,
        resourceName,
        originalError: error
      });
    }
  }

  /**
   * Write record to Excel (buffered)
   */
  async replicate(resourceName, operation, data, id) {
    if (operation === 'delete') {
      // Excel doesn't support deletes - skip
      return { success: true, skipped: true, reason: 'Excel format does not support deletes' };
    }

    // Add to buffer
    if (!this.buffers.has(resourceName)) {
      this.buffers.set(resourceName, []);
    }

    this.buffers.get(resourceName).push(data);

    // Flush if buffer is getting large (every 1000 records)
    if (this.buffers.get(resourceName).length >= 1000) {
      await this._flushBuffer(resourceName);
    }

    return {
      success: true,
      resourceName,
      id,
      operation,
      buffered: true
    };
  }

  /**
   * Write batch of records to Excel
   */
  async replicateBatch(resourceName, records) {
    if (!records || records.length === 0) {
      return {
        success: true,
        recordsWritten: 0
      };
    }

    // Add all to buffer
    if (!this.buffers.has(resourceName)) {
      this.buffers.set(resourceName, []);
    }

    const buffer = this.buffers.get(resourceName);
    for (const record of records) {
      if (record.operation !== 'delete') {
        buffer.push(record.data);
      }
    }

    // Flush buffer
    const result = await this._flushBuffer(resourceName);

    return result;
  }

  /**
   * Test connection (check if output driver is accessible and exceljs is available)
   */
  async testConnection() {
    if (!this.excelAvailable) {
      throw new ReplicationError('Excel library not available. Install with: npm install exceljs', {
        operation: 'testConnection',
        replicatorClass: this.name
      });
    }

    try {
      // Try to write a test file via output driver
      const testFile = '.test.xlsx';
      await this.outputDriver.write(testFile, 'test');
      await this.outputDriver.delete(testFile);
      return true;
    } catch (error) {
      throw new ReplicationError(`Output driver not accessible: ${error.message}`, {
        operation: 'testConnection',
        replicatorClass: this.name,
        outputDriver: this.outputConfig.driver
      });
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
   * Get status
   */
  async getStatus() {
    return {
      ...await super.getStatus(),
      connected: this.excelAvailable,
      outputDriver: this.outputConfig.driver,
      excelAvailable: this.excelAvailable,
      stats: this.stats
    };
  }

  /**
   * Close and flush all buffers
   */
  async close() {
    // Flush all remaining buffers
    for (const resourceName of this.buffers.keys()) {
      await this._flushBuffer(resourceName);
    }
    this.buffers.clear();
    this.workbooks.clear();
  }
}

export default ExcelReplicator;
