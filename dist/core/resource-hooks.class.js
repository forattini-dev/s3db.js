export class ResourceHooks {
    static HOOK_EVENTS = [
        'beforeInsert', 'afterInsert',
        'beforeUpdate', 'afterUpdate',
        'beforeDelete', 'afterDelete',
        'beforeGet', 'afterGet',
        'beforeList', 'afterList',
        'beforeQuery', 'afterQuery',
        'beforePatch', 'afterPatch',
        'beforeReplace', 'afterReplace',
        'beforeExists', 'afterExists',
        'beforeCount', 'afterCount',
        'beforeGetMany', 'afterGetMany',
        'beforeDeleteMany', 'afterDeleteMany'
    ];
    resource;
    _hooks;
    constructor(resource, config = {}) {
        this.resource = resource;
        this._hooks = {};
        for (const event of ResourceHooks.HOOK_EVENTS) {
            this._hooks[event] = [];
        }
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
    getHooks() {
        return this._hooks;
    }
    getHooksForEvent(event) {
        return this._hooks[event] || [];
    }
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
    _bindHook(fn) {
        if (typeof fn !== 'function') {
            return null;
        }
        const hookFn = fn;
        const original = hookFn.__s3db_original || hookFn;
        const bound = original.bind(this.resource);
        try {
            Object.defineProperty(bound, '__s3db_original', {
                value: original,
                enumerable: false,
                configurable: true,
            });
        }
        catch (_) {
            bound.__s3db_original = original;
        }
        return bound;
    }
    hasHooks(event) {
        const hooks = this._hooks[event];
        return hooks !== undefined && hooks.length > 0;
    }
    getHookCount(event) {
        const hooks = this._hooks[event];
        return hooks ? hooks.length : 0;
    }
    clearHooks(event) {
        if (this._hooks[event]) {
            this._hooks[event] = [];
        }
    }
    clearAllHooks() {
        for (const event of ResourceHooks.HOOK_EVENTS) {
            this._hooks[event] = [];
        }
    }
}
export default ResourceHooks;
//# sourceMappingURL=resource-hooks.class.js.map