import { EventEmitter } from 'events';
import { createLogger } from '../../../concerns/logger.js';

export interface ApiEventEmitterOptions {
  enabled?: boolean;
  logLevel?: string;
  maxListeners?: number;
}

export interface EventData {
  event?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface EventStats {
  enabled: boolean;
  maxListeners: number;
  listeners: Record<string, number>;
}

const logger = createLogger({ name: 'EventEmitter', level: 'info' });

export class ApiEventEmitter extends EventEmitter {
  private options: Required<ApiEventEmitterOptions>;

  constructor(options: ApiEventEmitterOptions = {}) {
    super();

    this.options = {
      enabled: options.enabled !== false,
      logLevel: options.logLevel || 'info',
      maxListeners: options.maxListeners || 10
    };

    this.setMaxListeners(this.options.maxListeners);
  }

  override emit(event: string, data: EventData = {}): boolean {
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

  emitUserEvent(action: string, data: EventData): void {
    this.emit(`user:${action}`, data);
  }

  emitAuthEvent(action: string, data: EventData): void {
    this.emit(`auth:${action}`, data);
  }

  emitResourceEvent(action: string, data: EventData): void {
    this.emit(`resource:${action}`, data);
  }

  emitRequestEvent(action: string, data: EventData): void {
    this.emit(`request:${action}`, data);
  }

  getStats(): EventStats {
    const stats: EventStats = {
      enabled: this.options.enabled,
      maxListeners: this.options.maxListeners,
      listeners: {}
    };

    for (const event of this.eventNames()) {
      stats.listeners[event as string] = this.listenerCount(event);
    }

    return stats;
  }
}

export default ApiEventEmitter;
