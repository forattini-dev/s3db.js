import { createLogger } from './logger.js';
import { bumpProcessMaxListeners } from './process-max-listeners.js';
export class ProcessManager {
    options;
    logger;
    intervals;
    timeouts;
    cleanups;
    isShuttingDown;
    shutdownPromise;
    _boundSignalHandler;
    _boundUncaughtHandler;
    _boundUnhandledHandler;
    _signalHandlersSetup;
    constructor(options = {}) {
        this.options = {
            logLevel: options.logLevel || 'info',
            shutdownTimeout: options.shutdownTimeout || 30000,
            exitOnSignal: options.exitOnSignal !== false,
        };
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            const logLevel = this.options.logLevel;
            this.logger = createLogger({ name: 'ProcessManager', level: logLevel });
        }
        this.intervals = new Map();
        this.timeouts = new Map();
        this.cleanups = new Map();
        this.isShuttingDown = false;
        this.shutdownPromise = null;
        this._signalHandlersSetup = false;
        this._boundSignalHandler = this._handleSignal.bind(this);
        this._boundUncaughtHandler = null;
        this._boundUnhandledHandler = null;
        this._setupSignalHandlers();
        this.logger.debug({ shutdownTimeout: this.options.shutdownTimeout }, 'ProcessManager initialized');
    }
    setInterval(fn, interval, name) {
        if (this.isShuttingDown) {
            throw new Error(`[ProcessManager] Cannot register interval '${name}' during shutdown`);
        }
        if (this.intervals.has(name)) {
            this.logger.warn({ name }, `interval '${name}' already exists, clearing previous`);
            this.clearInterval(name);
        }
        const start = Date.now();
        let expected = start + interval;
        let timerId;
        const tick = () => {
            const now = Date.now();
            const drift = now - expected;
            let executions = 1;
            if (drift > interval) {
                executions += Math.floor(drift / interval);
            }
            try {
                for (let i = 0; i < executions; i++)
                    fn();
            }
            finally {
                expected += executions * interval;
                const nextDelay = Math.max(0, interval - (drift % interval));
                timerId = setTimeout(tick, nextDelay);
            }
        };
        timerId = setTimeout(tick, interval);
        this.intervals.set(name, { id: timerId, fn, interval, precise: true });
        this.logger.debug({ name, interval }, `registered interval '${name}' (${interval}ms)`);
        return timerId;
    }
    clearInterval(name) {
        const entry = this.intervals.get(name);
        if (entry) {
            if (entry.precise) {
                clearTimeout(entry.id);
            }
            else {
                clearInterval(entry.id);
            }
            this.intervals.delete(name);
            this.logger.debug({ name }, `cleared interval '${name}'`);
        }
    }
    setTimeout(fn, delay, name) {
        if (this.isShuttingDown) {
            throw new Error(`[ProcessManager] Cannot register timeout '${name}' during shutdown`);
        }
        if (this.timeouts.has(name)) {
            this.logger.warn({ name }, `timeout '${name}' already exists, clearing previous`);
            this.clearTimeout(name);
        }
        const id = setTimeout(() => {
            fn();
            this.timeouts.delete(name);
        }, delay);
        this.timeouts.set(name, { id, fn, delay });
        this.logger.debug({ name, delay }, `registered timeout '${name}' (${delay}ms)`);
        return id;
    }
    clearTimeout(name) {
        const entry = this.timeouts.get(name);
        if (entry) {
            clearTimeout(entry.id);
            this.timeouts.delete(name);
            this.logger.debug({ name }, `cleared timeout '${name}'`);
        }
    }
    registerCleanup(cleanupFn, name) {
        if (this.isShuttingDown) {
            throw new Error(`[ProcessManager] Cannot register cleanup '${name}' during shutdown`);
        }
        if (this.cleanups.has(name)) {
            this.logger.warn({ name }, `cleanup '${name}' already registered, replacing`);
        }
        this.cleanups.set(name, cleanupFn);
        this.logger.debug({ name }, `registered cleanup '${name}'`);
    }
    unregisterCleanup(name) {
        if (this.cleanups.delete(name)) {
            this.logger.debug({ name }, `unregistered cleanup '${name}'`);
        }
    }
    _setupSignalHandlers() {
        if (this._signalHandlersSetup)
            return;
        this._boundUncaughtHandler = (err) => {
            this.logger.error({ error: err.message, stack: err.stack }, 'uncaught exception');
            this._handleSignal('uncaughtException');
        };
        this._boundUnhandledHandler = (reason, promise) => {
            this.logger.error({ reason, promise: String(promise) }, 'unhandled rejection');
            this._handleSignal('unhandledRejection');
        };
        bumpProcessMaxListeners(4);
        process.on('SIGTERM', this._boundSignalHandler);
        process.on('SIGINT', this._boundSignalHandler);
        process.on('uncaughtException', this._boundUncaughtHandler);
        process.on('unhandledRejection', this._boundUnhandledHandler);
        this._signalHandlersSetup = true;
        this.logger.debug('signal handlers registered (SIGTERM, SIGINT, uncaughtException, unhandledRejection)');
    }
    async _handleSignal(signal) {
        if (this.isShuttingDown) {
            this.logger.debug({ signal }, `shutdown already in progress, ignoring ${signal}`);
            return;
        }
        try {
            await this.shutdown();
            if (this.options.exitOnSignal) {
                process.exit(0);
            }
        }
        catch (err) {
            const error = err;
            this.logger.error({ error: error.message, stack: error.stack }, 'error during shutdown');
            if (this.options.exitOnSignal) {
                process.exit(1);
            }
        }
    }
    async shutdown(options = {}) {
        if (this.isShuttingDown) {
            this.logger.debug('shutdown already in progress, waiting for completion...');
            return this.shutdownPromise;
        }
        this.isShuttingDown = true;
        const timeout = options.timeout || this.options.shutdownTimeout;
        this.shutdownPromise = this._performShutdown(timeout);
        return this.shutdownPromise;
    }
    async _performShutdown(timeout) {
        const startTime = Date.now();
        if (this.intervals.size > 0) {
            for (const [name, entry] of this.intervals.entries()) {
                if (entry.precise) {
                    clearTimeout(entry.id);
                }
                else {
                    clearInterval(entry.id);
                }
                this.logger.debug({ name }, `cleared interval '${name}'`);
            }
            this.intervals.clear();
        }
        if (this.timeouts.size > 0) {
            for (const [name, entry] of this.timeouts.entries()) {
                clearTimeout(entry.id);
                this.logger.debug({ name }, `cleared timeout '${name}'`);
            }
            this.timeouts.clear();
        }
        if (this.cleanups.size > 0) {
            const cleanupPromises = Array.from(this.cleanups.entries()).map(async ([name, cleanupFn]) => {
                try {
                    const cleanupTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`Cleanup '${name}' timed out`)), timeout));
                    await Promise.race([
                        cleanupFn(),
                        cleanupTimeout
                    ]);
                    this.logger.debug({ name }, `cleanup '${name}' completed`);
                }
                catch (err) {
                    const error = err;
                    this.logger.error({ name, error: error.message }, `cleanup '${name}' failed`);
                }
            });
            await Promise.allSettled(cleanupPromises);
            this.cleanups.clear();
        }
        const elapsed = Date.now() - startTime;
        this.logger.debug({ elapsed }, `shutdown completed in ${elapsed}ms`);
    }
    getStatus() {
        return {
            isShuttingDown: this.isShuttingDown,
            intervals: Array.from(this.intervals.keys()),
            timeouts: Array.from(this.timeouts.keys()),
            cleanups: Array.from(this.cleanups.keys()),
            counts: {
                intervals: this.intervals.size,
                timeouts: this.timeouts.size,
                cleanups: this.cleanups.size
            }
        };
    }
    removeSignalHandlers() {
        if (!this._signalHandlersSetup)
            return;
        process.removeListener('SIGTERM', this._boundSignalHandler);
        process.removeListener('SIGINT', this._boundSignalHandler);
        if (this._boundUncaughtHandler) {
            process.removeListener('uncaughtException', this._boundUncaughtHandler);
            this._boundUncaughtHandler = null;
        }
        if (this._boundUnhandledHandler) {
            process.removeListener('unhandledRejection', this._boundUnhandledHandler);
            this._boundUnhandledHandler = null;
        }
        this._signalHandlersSetup = false;
        bumpProcessMaxListeners(-4);
        this.logger.debug('signal handlers removed');
    }
}
let globalInstance = null;
export function getProcessManager(options = {}) {
    if (!globalInstance) {
        globalInstance = new ProcessManager(options);
    }
    return globalInstance;
}
export function resetProcessManager() {
    if (globalInstance) {
        globalInstance.removeSignalHandlers();
        globalInstance = null;
    }
}
export default ProcessManager;
//# sourceMappingURL=process-manager.js.map