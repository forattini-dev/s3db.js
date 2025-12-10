import AsyncEventEmitter from '../concerns/async-event-emitter.js';
export class ResourceEvents {
    resource;
    disabled;
    _emitterProto;
    _pendingListeners;
    _wired;
    constructor(resource, config = {}) {
        this.resource = resource;
        this._emitterProto = AsyncEventEmitter.prototype;
        this.disabled = config.disableEvents === true || config.disableResourceEvents === true;
        const events = config.events || {};
        this._pendingListeners = (!this.disabled && events && Object.keys(events).length > 0)
            ? events
            : null;
        this._wired = this.disabled || !this._pendingListeners;
    }
    isDisabled() {
        return this.disabled;
    }
    isWired() {
        return this._wired;
    }
    ensureWired() {
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
                        this._emitterProto.on.call(this.resource, eventName, listener.bind(this.resource));
                    }
                }
            }
            else if (typeof listeners === 'function') {
                this._emitterProto.on.call(this.resource, eventName, listeners.bind(this.resource));
            }
        }
        this._pendingListeners = null;
        this._wired = true;
    }
    emitStandardized(event, payload, id = null) {
        if (this.disabled) {
            return;
        }
        this.ensureWired();
        this._emitterProto.emit.call(this.resource, event, payload);
        if (id) {
            this._emitterProto.emit.call(this.resource, `${event}:${id}`, payload);
        }
    }
    on(eventName, listener) {
        if (this.disabled) {
            return this.resource;
        }
        this.ensureWired();
        this._emitterProto.on.call(this.resource, eventName, listener);
        return this.resource;
    }
    once(eventName, listener) {
        if (this.disabled) {
            return this.resource;
        }
        this.ensureWired();
        this._emitterProto.once.call(this.resource, eventName, listener);
        return this.resource;
    }
    emit(eventName, ...args) {
        if (this.disabled) {
            return false;
        }
        this.ensureWired();
        return this._emitterProto.emit.call(this.resource, eventName, ...args);
    }
}
export default ResourceEvents;
//# sourceMappingURL=resource-events.class.js.map