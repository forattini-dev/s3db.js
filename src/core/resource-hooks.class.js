/**
 * ResourceHooks manages the hooks system for a Resource.
 * Hooks are functions that run before or after CRUD operations.
 */
export class ResourceHooks {
    /**
     * All supported hook events
     */
    static HOOK_EVENTS = [
        // Insert hooks
        'beforeInsert', 'afterInsert',
        // Update hooks
        'beforeUpdate', 'afterUpdate',
        // Delete hooks
        'beforeDelete', 'afterDelete',
        // Get hooks
        'beforeGet', 'afterGet',
        // List hooks
        'beforeList', 'afterList',
        // Query hooks
        'beforeQuery', 'afterQuery',
        // Patch hooks
        'beforePatch', 'afterPatch',
        // Replace hooks
        'beforeReplace', 'afterReplace',
        // Exists hooks
        'beforeExists', 'afterExists',
        // Count hooks
        'beforeCount', 'afterCount',
        // GetMany hooks
        'beforeGetMany', 'afterGetMany',
        // DeleteMany hooks
        'beforeDeleteMany', 'afterDeleteMany'
    ];

    /**
     * Create a new ResourceHooks instance
     * @param {Object} resource - Parent Resource instance
     * @param {Object} config - Configuration options
     * @param {Object} [config.hooks={}] - Initial hooks to register
     */
    constructor(resource, config = {}) {
        this.resource = resource;

        // Initialize hooks storage for all events
        this._hooks = {};
        for (const event of ResourceHooks.HOOK_EVENTS) {
            this._hooks[event] = [];
        }

        // Register initial hooks from config
        const configHooks = config.hooks || {};
        for (const [event, hooksArr] of Object.entries(configHooks)) {
            if (Array.isArray(hooksArr) && this._hooks[event]) {
                for (const fn of hooksArr) {
                    const bound = this._bindHook(fn);
                    if (bound) {
                        this._hooks[event].push(bound);
                    }
                }
            }
        }
    }

    /**
     * Get all hooks (for backwards compatibility and export)
     * @returns {Object} Hooks object with all events
     */
    getHooks() {
        return this._hooks;
    }

    /**
     * Get hooks for a specific event
     * @param {string} event - Hook event name
     * @returns {Array<Function>} Array of hook functions
     */
    getHooksForEvent(event) {
        return this._hooks[event] || [];
    }

    /**
     * Add a hook function for a specific event
     * @param {string} event - Hook event (beforeInsert, afterInsert, etc.)
     * @param {Function} fn - Hook function
     * @returns {boolean} True if hook was added
     */
    addHook(event, fn) {
        if (!this._hooks[event]) {
            return false;
        }

        const bound = this._bindHook(fn);
        if (bound) {
            this._hooks[event].push(bound);
            return true;
        }
        return false;
    }

    /**
     * Execute hooks for a specific event
     * Hooks are executed in order, each receiving the result of the previous.
     *
     * @param {string} event - Hook event
     * @param {*} data - Data to pass to hooks
     * @returns {Promise<*>} Modified data after all hooks
     */
    async executeHooks(event, data) {
        const hooks = this._hooks[event];
        if (!hooks || hooks.length === 0) {
            return data;
        }

        let result = data;
        for (const hook of hooks) {
            result = await hook(result);
        }

        return result;
    }

    /**
     * Bind a hook function to the resource context.
     * This ensures hooks can access `this` as the Resource instance.
     *
     * @param {Function} fn - Hook function to bind
     * @returns {Function|null} Bound function or null if fn is not a function
     * @private
     */
    _bindHook(fn) {
        if (typeof fn !== 'function') {
            return null;
        }

        // Get original function if already bound
        const original = fn.__s3db_original || fn;
        const bound = original.bind(this.resource);

        // Store reference to original for debugging/introspection
        try {
            Object.defineProperty(bound, '__s3db_original', {
                value: original,
                enumerable: false,
                configurable: true,
            });
        } catch (_) {
            bound.__s3db_original = original;
        }

        return bound;
    }

    /**
     * Check if an event has any hooks registered
     * @param {string} event - Hook event name
     * @returns {boolean}
     */
    hasHooks(event) {
        const hooks = this._hooks[event];
        return hooks && hooks.length > 0;
    }

    /**
     * Get the count of hooks for an event
     * @param {string} event - Hook event name
     * @returns {number}
     */
    getHookCount(event) {
        const hooks = this._hooks[event];
        return hooks ? hooks.length : 0;
    }

    /**
     * Clear all hooks for an event
     * @param {string} event - Hook event name
     */
    clearHooks(event) {
        if (this._hooks[event]) {
            this._hooks[event] = [];
        }
    }

    /**
     * Clear all hooks
     */
    clearAllHooks() {
        for (const event of ResourceHooks.HOOK_EVENTS) {
            this._hooks[event] = [];
        }
    }
}
