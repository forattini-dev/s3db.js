import EventEmitter from 'events';
import { createLogger } from './logger.js';
export class AsyncEventEmitter extends EventEmitter {
    _asyncMode;
    logLevel;
    logger;
    constructor(options = {}) {
        super();
        this._asyncMode = true;
        this.logLevel = options.logLevel || 'info';
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            this.logger = createLogger({ name: 'AsyncEventEmitter', level: this.logLevel });
        }
    }
    emit(event, ...args) {
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
                    await listener(...args);
                }
                catch (error) {
                    if (event !== 'error') {
                        this.emit('error', error);
                    }
                    else {
                        const err = error;
                        this.logger.error({ error: err.message, stack: err.stack }, 'Error in error handler');
                    }
                }
            }
        });
        return true;
    }
    emitSync(event, ...args) {
        return super.emit(event, ...args);
    }
    setAsyncMode(enabled) {
        this._asyncMode = enabled;
    }
}
export default AsyncEventEmitter;
//# sourceMappingURL=async-event-emitter.js.map