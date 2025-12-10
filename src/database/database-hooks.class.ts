import { DatabaseError } from '../errors.js';
import tryFn from '../concerns/try-fn.js';
import type { DatabaseRef, HookEventName, DatabaseHookFunction } from './types.js';
import type { CreateResourceConfig } from './database-resources.class.js';

export const HOOK_EVENTS: HookEventName[] = [
  'beforeConnect', 'afterConnect',
  'beforeCreateResource', 'afterCreateResource',
  'beforeUploadMetadata', 'afterUploadMetadata',
  'beforeDisconnect', 'afterDisconnect',
  'resourceCreated', 'resourceUpdated'
];

export class DatabaseHooks {
  private _hooks: Map<HookEventName, DatabaseHookFunction[]>;
  private _hookEvents: HookEventName[];
  private _hooksInstalled: boolean;
  private _originalConnect?: () => Promise<void>;
  private _originalCreateResource?: (config: CreateResourceConfig) => Promise<any>;
  private _originalUploadMetadataFile?: () => Promise<void>;
  private _originalDisconnect?: () => Promise<void>;

  constructor(private database: DatabaseRef) {
    this._hooks = new Map();
    this._hookEvents = [...HOOK_EVENTS];
    this._hooksInstalled = false;
    this._initHooks();
  }

  private _initHooks(): void {
    this._hooks = new Map();
    for (const event of this._hookEvents) {
      this._hooks.set(event, []);
    }
  }

  get hookEvents(): HookEventName[] {
    return [...this._hookEvents];
  }

  get isInstalled(): boolean {
    return this._hooksInstalled;
  }

  wrapMethods(
    connect: () => Promise<void>,
    createResource: (config: CreateResourceConfig) => Promise<any>,
    uploadMetadataFile: () => Promise<void>,
    disconnect: () => Promise<void>
  ): {
    connect: () => Promise<void>;
    createResource: (config: CreateResourceConfig) => Promise<any>;
    uploadMetadataFile: () => Promise<void>;
    disconnect: () => Promise<void>;
  } {
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

    const wrappedConnect = async (): Promise<void> => {
      await this.executeHooks('beforeConnect', {});
      const result = await this._originalConnect!();
      await this.executeHooks('afterConnect', { result });
      return result;
    };

    const wrappedCreateResource = async (config: CreateResourceConfig): Promise<any> => {
      await this.executeHooks('beforeCreateResource', { config });
      const resource = await this._originalCreateResource!(config);
      await this.executeHooks('afterCreateResource', { resource, config });
      return resource;
    };

    const wrappedUploadMetadataFile = async (): Promise<void> => {
      await this.executeHooks('beforeUploadMetadata', {});
      const result = await this._originalUploadMetadataFile!();
      await this.executeHooks('afterUploadMetadata', { result });
      return result;
    };

    const wrappedDisconnect = async (): Promise<void> => {
      await this.executeHooks('beforeDisconnect', {});
      const result = await this._originalDisconnect!();
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

  addHook(event: HookEventName, fn: DatabaseHookFunction): void {
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
    this._hooks.get(event)!.push(fn);
  }

  removeHook(event: HookEventName, fn: DatabaseHookFunction): void {
    if (!this._hooks.has(event)) return;

    const hooks = this._hooks.get(event)!;
    const index = hooks.indexOf(fn);
    if (index > -1) {
      hooks.splice(index, 1);
    }
  }

  getHooks(event: HookEventName): DatabaseHookFunction[] {
    if (!this._hooks.has(event)) return [];
    return [...this._hooks.get(event)!];
  }

  clearHooks(event: HookEventName): void {
    if (!this._hooks.has(event)) return;
    this._hooks.get(event)!.length = 0;
  }

  async executeHooks(event: HookEventName, context: Record<string, unknown> = {}): Promise<void> {
    if (!this._hooks.has(event)) return;

    const hooks = this._hooks.get(event)!;
    for (const hook of hooks) {
      const [ok, error] = await tryFn(() => hook({ database: this.database, ...context }));
      if (!ok) {
        this.database.emit('hookError', { event, error, context });

        if (this.database.strictHooks) {
          throw new DatabaseError(`Hook execution failed for event '${event}': ${(error as Error).message}`, {
            event,
            originalError: error,
            context
          });
        }
      }
    }
  }
}
