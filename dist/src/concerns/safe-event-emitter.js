import EventEmitter from 'events';
import { createLogger } from './logger.js';
export class SafeEventEmitter extends EventEmitter {
    options;
    logger;
    _signalHandlersSetup;
    _isDestroyed;
    _boundCleanupHandler;
    constructor(options = {}) {
        super();
        this.options = {
            logLevel: options.logLevel || 'info',
            autoCleanup: options.autoCleanup !== false,
            maxListeners: options.maxListeners || 0
        };
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
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
    _setupSignalHandlers() {
        if (this._signalHandlersSetup)
            return;
        this._boundCleanupHandler = this._handleCleanup.bind(this);
        process.once('SIGTERM', this._boundCleanupHandler);
        process.once('SIGINT', this._boundCleanupHandler);
        process.once('beforeExit', this._boundCleanupHandler);
        this._signalHandlersSetup = true;
        this.logger.debug('Signal handlers registered (SIGTERM, SIGINT, beforeExit)');
    }
    _handleCleanup(signal) {
        if (this._isDestroyed)
            return;
        this.logger.debug({ signal }, `Received ${signal}, cleaning up listeners...`);
        this.destroy();
    }
    on(eventName, listener) {
        try {
            super.on(eventName, listener);
        }
        catch (err) {
            this.handleError(err, 'on');
        }
        return this;
    }
    once(eventName, listener) {
        try {
            super.once(eventName, listener);
        }
        catch (err) {
            this.handleError(err, 'once');
        }
        return this;
    }
    emit(eventName, ...args) {
        try {
            return super.emit(eventName, ...args);
        }
        catch (err) {
            this.handleError(err, 'emit');
            return false;
        }
    }
    handleError(err, method) {
        this.logger.error({ err, method }, `Error in SafeEventEmitter.${method}: ${err.message}`);
    }
    getListenerStats() {
        const stats = {};
        const events = this.eventNames();
        for (const event of events) {
            stats[String(event)] = this.listenerCount(event);
        }
        return stats;
    }
    getTotalListenerCount() {
        return this.eventNames().reduce((total, event) => {
            return total + this.listenerCount(event);
        }, 0);
    }
    destroy() {
        if (this._isDestroyed)
            return;
        const totalListeners = this.getTotalListenerCount();
        this.logger.debug({ totalListeners }, `Destroying emitter (${totalListeners} listeners)...`);
        this.removeAllListeners();
        if (this._boundCleanupHandler) {
            process.removeListener('SIGTERM', this._boundCleanupHandler);
            process.removeListener('SIGINT', this._boundCleanupHandler);
            process.removeListener('beforeExit', this._boundCleanupHandler);
            this._signalHandlersSetup = false;
        }
        this._isDestroyed = true;
        this.logger.debug('Destroyed');
    }
    isDestroyed() {
        return this._isDestroyed;
    }
    removeSignalHandlers() {
        if (this._boundCleanupHandler) {
            process.removeListener('SIGTERM', this._boundCleanupHandler);
            process.removeListener('SIGINT', this._boundCleanupHandler);
            process.removeListener('beforeExit', this._boundCleanupHandler);
            this._signalHandlersSetup = false;
            this.logger.debug('Signal handlers removed');
        }
    }
}
export function createSafeEventEmitter(options = {}) {
    return new SafeEventEmitter(options);
}
export default SafeEventEmitter;
//# sourceMappingURL=safe-event-emitter.js.map