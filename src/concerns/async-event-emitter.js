import EventEmitter from 'events';

class AsyncEventEmitter extends EventEmitter {
  constructor() {
    super();
    this._asyncMode = true;
  }

  emit(event, ...args) {
    if (!this._asyncMode) {
      return super.emit(event, ...args);
    }

    const listeners = this.listeners(event);
    
    if (listeners.length === 0) {
      return false;
    }

    setImmediate(() => {
      for (const listener of listeners) {
        try {
          listener(...args);
        } catch (error) {
          if (event !== 'error') {
            this.emit('error', error);
          } else {
            console.error('Error in error handler:', error);
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