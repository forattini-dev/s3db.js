import AsyncEventEmitter from '../concerns/async-event-emitter.js';

type EventListener = (...args: unknown[]) => void | Promise<void>;

export interface EventListeners {
  [eventName: string]: EventListener | EventListener[];
}

export interface ResourceEventsConfig {
  disableEvents?: boolean;
  disableResourceEvents?: boolean;
  events?: EventListeners;
}

export interface Resource extends AsyncEventEmitter {
  name: string;
}

export class ResourceEvents {
  resource: Resource;
  disabled: boolean;
  private _emitterProto: typeof AsyncEventEmitter.prototype;
  private _pendingListeners: EventListeners | null;
  private _wired: boolean;

  constructor(resource: Resource, config: ResourceEventsConfig = {}) {
    this.resource = resource;

    this._emitterProto = AsyncEventEmitter.prototype;

    this.disabled = config.disableEvents === true || config.disableResourceEvents === true;

    const events = config.events || {};
    this._pendingListeners = (!this.disabled && events && Object.keys(events).length > 0)
      ? events
      : null;

    this._wired = this.disabled || !this._pendingListeners;
  }

  isDisabled(): boolean {
    return this.disabled;
  }

  isWired(): boolean {
    return this._wired;
  }

  ensureWired(): void {
    if (this.disabled || this._wired) {
      return;
    }

    if (!this._pendingListeners) {
      this._wired = true;
      return;
    }

    for (const [eventName, listeners] of Object.entries(this._pendingListeners)) {
      if (Array.isArray(listeners)) {
        for (const listener of listeners) {
          if (typeof listener === 'function') {
            this._emitterProto.on.call(
              this.resource,
              eventName,
              listener.bind(this.resource)
            );
          }
        }
      } else if (typeof listeners === 'function') {
        this._emitterProto.on.call(
          this.resource,
          eventName,
          listeners.bind(this.resource)
        );
      }
    }

    this._pendingListeners = null;
    this._wired = true;
  }

  emitStandardized(event: string, payload: unknown, id: string | null = null): void {
    if (this.disabled) {
      return;
    }

    this.ensureWired();

    this._emitterProto.emit.call(this.resource, event, payload);

    if (id) {
      this._emitterProto.emit.call(this.resource, `${event}:${id}`, payload);
    }
  }

  on(eventName: string, listener: EventListener): Resource {
    if (this.disabled) {
      return this.resource;
    }
    this.ensureWired();
    this._emitterProto.on.call(this.resource, eventName, listener);
    return this.resource;
  }

  once(eventName: string, listener: EventListener): Resource {
    if (this.disabled) {
      return this.resource;
    }
    this.ensureWired();
    this._emitterProto.once.call(this.resource, eventName, listener);
    return this.resource;
  }

  emit(eventName: string, ...args: unknown[]): boolean {
    if (this.disabled) {
      return false;
    }
    this.ensureWired();
    return this._emitterProto.emit.call(this.resource, eventName, ...args);
  }
}

export default ResourceEvents;
