import AsyncEventEmitter from "../concerns/async-event-emitter.js";

/**
 * ResourceEvents handles event standardization and lazy event wiring for a Resource.
 * The Resource class still extends AsyncEventEmitter - this module just handles
 * the standardized event payload format and lazy initialization of configured listeners.
 */
export class ResourceEvents {
    /**
     * Create a new ResourceEvents instance
     * @param {Object} resource - Parent Resource instance (extends AsyncEventEmitter)
     * @param {Object} config - Configuration options
     * @param {boolean} [config.disableEvents=false] - Disable all event emission
     * @param {boolean} [config.disableResourceEvents=false] - Alias for disableEvents
     * @param {Object} [config.events={}] - Event listeners to wire up lazily
     */
    constructor(resource, config = {}) {
        this.resource = resource;

        // Get the AsyncEventEmitter prototype for direct access (avoids recursion)
        this._emitterProto = AsyncEventEmitter.prototype;

        // Check if events are disabled
        this.disabled = config.disableEvents === true || config.disableResourceEvents === true;

        // Store pending event listeners for lazy wiring
        const events = config.events || {};
        this._pendingListeners = (!this.disabled && events && Object.keys(events).length > 0)
            ? events
            : null;

        // Track if events have been wired
        this._wired = this.disabled || !this._pendingListeners;
    }

    /**
     * Check if events are disabled
     * @returns {boolean}
     */
    isDisabled() {
        return this.disabled;
    }

    /**
     * Check if events have been wired
     * @returns {boolean}
     */
    isWired() {
        return this._wired;
    }

    /**
     * Ensure event listeners from config are wired up.
     * This is called lazily on first event operation.
     */
    ensureWired() {
        if (this.disabled || this._wired) {
            return;
        }

        if (!this._pendingListeners) {
            this._wired = true;
            return;
        }

        // Wire up all pending listeners using AsyncEventEmitter prototype directly
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

    /**
     * Emit a standardized event with optional ID-specific event.
     * Standardized events have consistent payload format.
     *
     * @param {string} event - Event name (e.g., 'inserted', 'updated', 'deleted')
     * @param {Object} payload - Event payload
     * @param {string} [id=null] - Optional record ID for ID-specific events
     */
    emitStandardized(event, payload, id = null) {
        if (this.disabled) {
            return;
        }

        this.ensureWired();

        // Emit the main event using AsyncEventEmitter prototype directly
        this._emitterProto.emit.call(this.resource, event, payload);

        // Emit ID-specific event if ID provided (e.g., 'inserted:user-123')
        if (id) {
            this._emitterProto.emit.call(this.resource, `${event}:${id}`, payload);
        }
    }

    /**
     * Wrap the on() method to ensure events are wired first
     * @param {string} eventName - Event name
     * @param {Function} listener - Event listener
     * @returns {Object} The resource for chaining
     */
    on(eventName, listener) {
        if (this.disabled) {
            return this.resource;
        }
        this.ensureWired();
        return this._emitterProto.on.call(this.resource, eventName, listener);
    }

    /**
     * Wrap the once() method to ensure events are wired first
     * @param {string} eventName - Event name
     * @param {Function} listener - Event listener
     * @returns {Object} The resource for chaining
     */
    once(eventName, listener) {
        if (this.disabled) {
            return this.resource;
        }
        this.ensureWired();
        return this._emitterProto.once.call(this.resource, eventName, listener);
    }

    /**
     * Wrap the emit() method to ensure events are wired first
     * @param {string} eventName - Event name
     * @param {...*} args - Event arguments
     * @returns {boolean} Whether the event had listeners
     */
    emit(eventName, ...args) {
        if (this.disabled) {
            return false;
        }
        this.ensureWired();
        return this._emitterProto.emit.call(this.resource, eventName, ...args);
    }
}
