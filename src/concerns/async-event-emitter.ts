import EventEmitter from 'events';
import { createLogger, S3DBLogger, LogLevel } from './logger.js';

export interface AsyncEventEmitterOptions {
  logLevel?: LogLevel;
  logger?: S3DBLogger;
}

export class AsyncEventEmitter extends EventEmitter {
  private _asyncMode: boolean;
  logLevel: LogLevel;
  logger: S3DBLogger;

  constructor(options: AsyncEventEmitterOptions = {}) {
    super();
    this._asyncMode = true;
    this.logLevel = options.logLevel || 'info';

    if (options.logger) {
      this.logger = options.logger;
    } else {
      this.logger = createLogger({ name: 'AsyncEventEmitter', level: this.logLevel });
    }
  }

  override emit(event: string | symbol, ...args: unknown[]): boolean {
    if (!this._asyncMode) {
      return super.emit(event, ...args);
    }

    const listeners = this.listeners(event);

    if (listeners.length === 0) {
      return false;
    }

    setImmediate(async () => {
      for (const listener of listeners) {
        try {
          await (listener as (...args: unknown[]) => Promise<void>)(...args);
        } catch (error) {
          if (event !== 'error') {
            this.emit('error', error);
          } else {
            const err = error as Error;
            this.logger.error({ error: err.message, stack: err.stack }, 'Error in error handler');
          }
        }
      }
    });

    return true;
  }

  emitSync(event: string | symbol, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  setAsyncMode(enabled: boolean): void {
    this._asyncMode = enabled;
  }
}

export default AsyncEventEmitter;
