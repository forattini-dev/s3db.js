import Plugin from "./plugin.class.js";

export class LoggingPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.logLevel = options.logLevel || 'info';
    this.enableTimestamps = options.enableTimestamps !== false;
    this.enableColors = options.enableColors !== false;
    this.logFile = options.logFile || null;
    this.operations = new Map();
    this.startTime = null;
  }

  async setup(database) {
    await super.setup(database);
    
    this.startTime = Date.now();
    this.log('info', `🔧 LoggingPlugin initialized for database: ${database.constructor.name}`);
    
    // Listen to database events
    this.setupDatabaseListeners();
    
    // Listen to client events
    this.setupClientListeners();
  }

  async start() {
    await super.start();
    this.log('info', '▶️ LoggingPlugin started');
    
    // Reset operation counters
    this.operations.clear();
  }

  async stop() {
    await super.stop();
    this.log('info', '⏹️ LoggingPlugin stopped');
    this.printSummary();
  }

  setupDatabaseListeners() {
    if (!this.database) return;

    // Resource events
    this.database.on('s3db.resourceCreated', (resourceName) => {
      this.log('info', `📋 Resource created: ${resourceName}`);
      this.incrementOperation('resource.created');
    });

    this.database.on('s3db.resourceUpdated', (resourceName) => {
      this.log('info', `📝 Resource updated: ${resourceName}`);
      this.incrementOperation('resource.updated');
    });

    this.database.on('connected', () => {
      this.log('info', '🔗 Database connected');
      this.incrementOperation('database.connected');
    });

    this.database.on('metadataUploaded', (metadata) => {
      this.log('info', `📤 Metadata uploaded (${Object.keys(metadata.resources || {}).length} resources)`);
      this.incrementOperation('metadata.uploaded');
    });

    this.database.on('resourceDefinitionsChanged', (event) => {
      this.log('warn', `🔄 Resource definitions changed: ${event.changes.length} changes detected`);
      this.incrementOperation('definitions.changed');
    });
  }

  setupClientListeners() {
    if (!this.database.client) return;

    // S3 operation events
    this.database.client.on('command.request', (commandName, input) => {
      this.log('debug', `📤 S3 Request: ${commandName} ${input.Key || input.Prefix || ''}`);
      this.incrementOperation(`s3.${commandName.toLowerCase()}`);
    });

    this.database.client.on('command.response', (commandName, response, input) => {
      this.log('debug', `📥 S3 Response: ${commandName} ${input.Key || input.Prefix || ''}`);
      this.incrementOperation(`s3.${commandName.toLowerCase()}.success`);
    });

    // Resource operations
    this.database.client.on('putObject', (response, options) => {
      this.log('debug', `💾 Object stored: ${options.Key}`);
      this.incrementOperation('object.put');
    });

    this.database.client.on('getObject', (response, options) => {
      this.log('debug', `📖 Object retrieved: ${options.Key}`);
      this.incrementOperation('object.get');
    });

    this.database.client.on('deleteObject', (response, options) => {
      this.log('debug', `🗑️ Object deleted: ${options.Key}`);
      this.incrementOperation('object.delete');
    });

    this.database.client.on('listObjects', (response, options) => {
      const count = response.Contents ? response.Contents.length : 0;
      this.log('debug', `📋 Objects listed: ${count} objects (prefix: ${options.Prefix})`);
      this.incrementOperation('object.list');
    });

    // Cost tracking (if costs plugin is enabled)
    if (this.database.client.costs) {
      this.database.client.on('costs.updated', (costs) => {
        this.log('info', `💰 Cost updated: $${costs.total.toFixed(4)} (${costs.requests.total} requests)`);
      });
    }
  }

  incrementOperation(operationName) {
    const current = this.operations.get(operationName) || 0;
    this.operations.set(operationName, current + 1);
  }

  log(level, message) {
    if (!this.shouldLog(level)) return;

    const timestamp = this.enableTimestamps ? new Date().toISOString() : '';
    const coloredLevel = this.enableColors ? this.colorizeLevel(level) : level.toUpperCase();
    const logMessage = `${timestamp} [${coloredLevel}] ${message}`;

    // Console output
    console.log(logMessage);

    // File output (if configured)
    if (this.logFile) {
      // In a real implementation, you might use fs.appendFile here
      // For now, we'll just log to console
    }
  }

  shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const currentLevel = levels[this.logLevel] || 1;
    const messageLevel = levels[level] || 1;
    return messageLevel >= currentLevel;
  }

  colorizeLevel(level) {
    const colors = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
      reset: '\x1b[0m'   // Reset
    };

    return `${colors[level] || colors.info}${level.toUpperCase()}${colors.reset}`;
  }

  printSummary() {
    if (this.operations.size === 0) {
      this.log('info', '📊 No operations recorded');
      return;
    }

    const uptime = ((Date.now() - this.startTime) / 1000).toFixed(2);
    this.log('info', `📊 Operation Summary (uptime: ${uptime}s)`);
    this.log('info', '─'.repeat(50));

    // Sort operations by count (descending)
    const sortedOps = Array.from(this.operations.entries())
      .sort((a, b) => b[1] - a[1]);

    for (const [operation, count] of sortedOps) {
      const rate = (count / (uptime || 1)).toFixed(2);
      this.log('info', `  ${operation}: ${count} (${rate}/s)`);
    }

    this.log('info', '─'.repeat(50));
    const totalOps = Array.from(this.operations.values()).reduce((sum, count) => sum + count, 0);
    const avgRate = (totalOps / (uptime || 1)).toFixed(2);
    this.log('info', `  Total: ${totalOps} operations (${avgRate}/s)`);
  }

  // Public API for manual logging
  logInfo(message) {
    this.log('info', message);
  }

  logError(message) {
    this.log('error', message);
  }

  logDebug(message) {
    this.log('debug', message);
  }

  logWarn(message) {
    this.log('warn', message);
  }

  // Get current statistics
  getStats() {
    const uptime = this.startTime ? ((Date.now() - this.startTime) / 1000) : 0;
    const totalOps = Array.from(this.operations.values()).reduce((sum, count) => sum + count, 0);

    return {
      uptime: uptime.toFixed(2),
      totalOperations: totalOps,
      averageRate: (totalOps / (uptime || 1)).toFixed(2),
      operations: Object.fromEntries(this.operations)
    };
  }
}

export default LoggingPlugin