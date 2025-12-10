import { EventEmitter } from 'events';
import { createLogger } from '../../../concerns/logger.js';
const logger = createLogger({ name: 'EventEmitter', level: 'info' });
export class ApiEventEmitter extends EventEmitter {
    options;
    constructor(options = {}) {
        super();
        this.options = {
            enabled: options.enabled !== false,
            logLevel: options.logLevel || 'info',
            maxListeners: options.maxListeners || 10
        };
        this.setMaxListeners(this.options.maxListeners);
    }
    emit(event, data = {}) {
        if (!this.options.enabled) {
            return false;
        }
        if (this.options.logLevel) {
            logger.info(data, `[API Events] ${event}`);
        }
        super.emit(event, { event, ...data, timestamp: new Date().toISOString() });
        if (event.includes(':')) {
            const [prefix] = event.split(':');
            const wildcardEvent = `${prefix}:*`;
            super.emit(wildcardEvent, { event, ...data, timestamp: new Date().toISOString() });
        }
        return true;
    }
    emitUserEvent(action, data) {
        this.emit(`user:${action}`, data);
    }
    emitAuthEvent(action, data) {
        this.emit(`auth:${action}`, data);
    }
    emitResourceEvent(action, data) {
        this.emit(`resource:${action}`, data);
    }
    emitRequestEvent(action, data) {
        this.emit(`request:${action}`, data);
    }
    getStats() {
        const stats = {
            enabled: this.options.enabled,
            maxListeners: this.options.maxListeners,
            listeners: {}
        };
        for (const event of this.eventNames()) {
            stats.listeners[event] = this.listenerCount(event);
        }
        return stats;
    }
}
export default ApiEventEmitter;
//# sourceMappingURL=event-emitter.js.map