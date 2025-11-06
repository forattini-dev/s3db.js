class ProgressReporter {
  constructor() {
    this._total = 0;
    this._passed = 0;
    this._failed = 0;
    this._skipped = 0;
    this._startTime = 0;
    this._lastMessageLength = 0;
  }

  onRunStart(aggregatedResult) {
    this._total = aggregatedResult.numTotalTests || 0;
    this._startTime = Date.now();
    this._printProgress('Starting test run…');
  }

  onTestResult(_test, testResult) {
    this._passed += testResult.numPassingTests || 0;
    this._failed += testResult.numFailingTests || 0;
    this._skipped += (testResult.numPendingTests || 0) + (testResult.numTodoTests || 0);

    const latest = testResult.testFilePath || 'unknown test file';
    this._printProgress(`Completed ${this._basename(latest)}`);
  }

  onRunComplete() {
    this._printProgress('Test run complete', true);
    process.stderr.write('\n');
  }

  _printProgress(message, forceNewline = false) {
    if (!this._total) {
      return;
    }

    const executed = this._passed + this._failed + this._skipped;
    const durationMs = Date.now() - this._startTime;
    const duration = this._formatDuration(durationMs);

    const summary = `Progress: ${executed}/${this._total} tests | ✅ ${this._passed} | ❌ ${this._failed} | ⏸ ${this._skipped} | ⏱ ${duration}`;
    const line = `[jest-progress] ${summary} — ${message}`;

    const padding = this._lastMessageLength > line.length
      ? ' '.repeat(this._lastMessageLength - line.length)
      : '';

    this._lastMessageLength = line.length;

    if (forceNewline) {
      process.stderr.write(`\r${line}${padding}\n`);
    } else {
      process.stderr.write(`\r${line}${padding}`);
    }
  }

  _basename(filePath) {
    if (!filePath) return '';
    const separator = filePath.includes('\\') ? '\\' : '/';
    const parts = filePath.split(separator);
    return parts[parts.length - 1] || filePath;
  }

  _formatDuration(ms) {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes === 0) {
      return `${seconds}s`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  }
}

module.exports = ProgressReporter;
