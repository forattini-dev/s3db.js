import { DatabaseError } from '../errors.js';
import tryFn from '../concerns/try-fn.js';
export const HOOK_EVENTS = [
    'beforeConnect', 'afterConnect',
    'beforeCreateResource', 'afterCreateResource',
    'beforeUploadMetadata', 'afterUploadMetadata',
    'beforeDisconnect', 'afterDisconnect',
    'resourceCreated', 'resourceUpdated'
];
export class DatabaseHooks {
    database;
    _hooks;
    _hookEvents;
    _hooksInstalled;
    _originalConnect;
    _originalCreateResource;
    _originalUploadMetadataFile;
    _originalDisconnect;
    constructor(database) {
        this.database = database;
        this._hooks = new Map();
        this._hookEvents = [...HOOK_EVENTS];
        this._hooksInstalled = false;
        this._initHooks();
    }
    _initHooks() {
        this._hooks = new Map();
        for (const event of this._hookEvents) {
            this._hooks.set(event, []);
        }
    }
    get hookEvents() {
        return [...this._hookEvents];
    }
    get isInstalled() {
        return this._hooksInstalled;
    }
    wrapMethods(connect, createResource, uploadMetadataFile, disconnect) {
        if (this._hooksInstalled) {
            return {
                connect,
                createResource,
                uploadMetadataFile,
                disconnect
            };
        }
        this._originalConnect = connect;
        this._originalCreateResource = createResource;
        this._originalUploadMetadataFile = uploadMetadataFile;
        this._originalDisconnect = disconnect;
        const wrappedConnect = async () => {
            await this.executeHooks('beforeConnect', {});
            const result = await this._originalConnect();
            await this.executeHooks('afterConnect', { result });
            return result;
        };
        const wrappedCreateResource = async (config) => {
            await this.executeHooks('beforeCreateResource', { config });
            const resource = await this._originalCreateResource(config);
            await this.executeHooks('afterCreateResource', { resource, config });
            return resource;
        };
        const wrappedUploadMetadataFile = async () => {
            await this.executeHooks('beforeUploadMetadata', {});
            const result = await this._originalUploadMetadataFile();
            await this.executeHooks('afterUploadMetadata', { result });
            return result;
        };
        const wrappedDisconnect = async () => {
            await this.executeHooks('beforeDisconnect', {});
            const result = await this._originalDisconnect();
            await this.executeHooks('afterDisconnect', { result });
            return result;
        };
        this._hooksInstalled = true;
        return {
            connect: wrappedConnect,
            createResource: wrappedCreateResource,
            uploadMetadataFile: wrappedUploadMetadataFile,
            disconnect: wrappedDisconnect
        };
    }
    addHook(event, fn) {
        if (!this._hooks.has(event)) {
            throw new DatabaseError(`Unknown hook event: ${event}`, {
                operation: 'addHook',
                invalidEvent: event,
                availableEvents: this._hookEvents,
                suggestion: `Use one of the available hook events: ${this._hookEvents.join(', ')}`
            });
        }
        if (typeof fn !== 'function') {
            throw new DatabaseError('Hook function must be a function', {
                operation: 'addHook',
                event,
                receivedType: typeof fn,
                suggestion: 'Provide a function that will be called when the hook event occurs'
            });
        }
        this._hooks.get(event).push(fn);
    }
    removeHook(event, fn) {
        if (!this._hooks.has(event))
            return;
        const hooks = this._hooks.get(event);
        const index = hooks.indexOf(fn);
        if (index > -1) {
            hooks.splice(index, 1);
        }
    }
    getHooks(event) {
        if (!this._hooks.has(event))
            return [];
        return [...this._hooks.get(event)];
    }
    clearHooks(event) {
        if (!this._hooks.has(event))
            return;
        this._hooks.get(event).length = 0;
    }
    async executeHooks(event, context = {}) {
        if (!this._hooks.has(event))
            return;
        const hooks = this._hooks.get(event);
        for (const hook of hooks) {
            const [ok, error] = await tryFn(() => hook({ database: this.database, ...context }));
            if (!ok) {
                this.database.emit('hookError', { event, error, context });
                if (this.database.strictHooks) {
                    throw new DatabaseError(`Hook execution failed for event '${event}': ${error.message}`, {
                        event,
                        originalError: error,
                        context
                    });
                }
            }
        }
    }
}
//# sourceMappingURL=database-hooks.class.js.map