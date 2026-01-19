import EventEmitter from 'events';
import { createLogger, S3DBLogger, LogLevel } from './logger.js';
import { bumpProcessMaxListeners } from './process-max-listeners.js';

export interface SafeEventEmitterOptions {
  logLevel?: LogLevel;
  logger?: S3DBLogger;
  autoCleanup?: boolean;
  maxListeners?: number;
}

export interface ListenerStats {
  [eventName: string]: number;
}

export class SafeEventEmitter extends EventEmitter {
  options: Required<Omit<SafeEventEmitterOptions, 'logger'>> & { logger?: S3DBLogger };
  logger: S3DBLogger;
  private _signalHandlersSetup: boolean;
  private _isDestroyed: boolean;
  private _boundCleanupHandler?: (signal: string) => void;

  constructor(options: SafeEventEmitterOptions = {}) {
    super();

    this.options = {
      logLevel: options.logLevel || 'info',
      autoCleanup: options.autoCleanup !== false,
      maxListeners: options.maxListeners || 0
    };

    if (options.logger) {
      this.logger = options.logger;
    } else {
      this.logger = createLogger({ name: 'SafeEventEmitter', level: this.options.logLevel });
    }

    this._signalHandlersSetup = false;
    this._isDestroyed = false;

    if (this.options.maxListeners > 0) {
      this.setMaxListeners(this.options.maxListeners);
    }

    if (this.options.autoCleanup) {
      this._setupSignalHandlers();
    }

    this.logger.debug({ autoCleanup: this.options.autoCleanup }, `Initialized with auto-cleanup: ${this.options.autoCleanup}`);
  }

  private _setupSignalHandlers(): void {
    if (this._signalHandlersSetup) return;

    this._boundCleanupHandler = this._handleCleanup.bind(this);

    bumpProcessMaxListeners(3);
    process.once('SIGTERM', this._boundCleanupHandler);
    process.once('SIGINT', this._boundCleanupHandler);
    process.once('beforeExit', this._boundCleanupHandler);

    this._signalHandlersSetup = true;

    this.logger.debug('Signal handlers registered (SIGTERM, SIGINT, beforeExit)');
  }

  private _handleCleanup(signal: string): void {
    if (this._isDestroyed) return;

    this.logger.debug({ signal }, `Received ${signal}, cleaning up listeners...`);

    this.destroy();
  }

  override on(eventName: string | symbol, listener: (...args: unknown[]) => void): this {
    try {
      super.on(eventName, listener);
    } catch (err) {
      this.handleError(err as Error, 'on');
    }
    return this;
  }

  override once(eventName: string | symbol, listener: (...args: unknown[]) => void): this {
    try {
      super.once(eventName, listener);
    } catch (err) {
      this.handleError(err as Error, 'once');
    }
    return this;
  }

  override emit(eventName: string | symbol, ...args: unknown[]): boolean {
    try {
      return super.emit(eventName, ...args);
    } catch (err) {
      this.handleError(err as Error, 'emit');
      return false;
    }
  }

  private handleError(err: Error, method: string): void {
    this.logger.error({ err, method }, `Error in SafeEventEmitter.${method}: ${err.message}`);
  }


  getListenerStats(): ListenerStats {
    const stats: ListenerStats = {};
    const events = this.eventNames();

    for (const event of events) {
      stats[String(event)] = this.listenerCount(event);
    }

    return stats;
  }

  getTotalListenerCount(): number {
    return this.eventNames().reduce((total, event) => {
      return total + this.listenerCount(event);
    }, 0);
  }

  destroy(): void {
    if (this._isDestroyed) return;

    const totalListeners = this.getTotalListenerCount();

    this.logger.debug({ totalListeners }, `Destroying emitter (${totalListeners} listeners)...`);

    this.removeAllListeners();

    if (this._boundCleanupHandler && this._signalHandlersSetup) {
      process.removeListener('SIGTERM', this._boundCleanupHandler);
      process.removeListener('SIGINT', this._boundCleanupHandler);
      process.removeListener('beforeExit', this._boundCleanupHandler);
      this._signalHandlersSetup = false;
      bumpProcessMaxListeners(-3);
    }

    this._isDestroyed = true;

    this.logger.debug('Destroyed');
  }

  isDestroyed(): boolean {
    return this._isDestroyed;
  }

  removeSignalHandlers(): void {
    if (this._boundCleanupHandler && this._signalHandlersSetup) {
      process.removeListener('SIGTERM', this._boundCleanupHandler);
      process.removeListener('SIGINT', this._boundCleanupHandler);
      process.removeListener('beforeExit', this._boundCleanupHandler);
      this._signalHandlersSetup = false;
      bumpProcessMaxListeners(-3);

      this.logger.debug('Signal handlers removed');
    }
  }
}

export function createSafeEventEmitter(options: SafeEventEmitterOptions = {}): SafeEventEmitter {
  return new SafeEventEmitter(options);
}

export default SafeEventEmitter;
