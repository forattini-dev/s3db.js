import EventEmitter from 'events';
import { createLogger } from './logger.js';

class AsyncEventEmitter extends EventEmitter {
  constructor(options = {}) {
    super();
    this._asyncMode = true;
    this.logLevel = options.logLevel || 'info';

    // 🪵 Logger initialization
    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = this.logLevel;
      this.logger = createLogger({ name: 'AsyncEventEmitter', level: logLevel });
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
        } catch (error) {
          if (event !== 'error') {
            this.emit('error', error);
          } else {
            // 🪵 Error: error in error handler
            this.logger.error({ error: error.message, stack: error.stack }, 'Error in error handler');
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
