export type HookFunction<T = unknown> = (data: T) => T | Promise<T>;

export type BoundHookFunction<T = unknown> = HookFunction<T> & {
  __s3db_original?: HookFunction<T>;
};

export interface HooksCollection {
  beforeInsert: BoundHookFunction[];
  afterInsert: BoundHookFunction[];
  beforeUpdate: BoundHookFunction[];
  afterUpdate: BoundHookFunction[];
  beforeDelete: BoundHookFunction[];
  afterDelete: BoundHookFunction[];
  beforeGet: BoundHookFunction[];
  afterGet: BoundHookFunction[];
  beforeList: BoundHookFunction[];
  afterList: BoundHookFunction[];
  beforeQuery: BoundHookFunction[];
  afterQuery: BoundHookFunction[];
  beforePatch: BoundHookFunction[];
  afterPatch: BoundHookFunction[];
  beforeReplace: BoundHookFunction[];
  afterReplace: BoundHookFunction[];
  beforeExists: BoundHookFunction[];
  afterExists: BoundHookFunction[];
  beforeCount: BoundHookFunction[];
  afterCount: BoundHookFunction[];
  beforeGetMany: BoundHookFunction[];
  afterGetMany: BoundHookFunction[];
  beforeDeleteMany: BoundHookFunction[];
  afterDeleteMany: BoundHookFunction[];
  [event: string]: BoundHookFunction[];
}

export interface HooksConfig {
  [event: string]: HookFunction[];
}

export interface ResourceHooksConfig {
  hooks?: HooksConfig;
}

export interface Resource {
  name: string;
}

export type HookEvent =
  | 'beforeInsert' | 'afterInsert'
  | 'beforeUpdate' | 'afterUpdate'
  | 'beforeDelete' | 'afterDelete'
  | 'beforeGet' | 'afterGet'
  | 'beforeList' | 'afterList'
  | 'beforeQuery' | 'afterQuery'
  | 'beforePatch' | 'afterPatch'
  | 'beforeReplace' | 'afterReplace'
  | 'beforeExists' | 'afterExists'
  | 'beforeCount' | 'afterCount'
  | 'beforeGetMany' | 'afterGetMany'
  | 'beforeDeleteMany' | 'afterDeleteMany';

export class ResourceHooks {
  static HOOK_EVENTS: HookEvent[] = [
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

  resource: Resource;
  private _hooks: HooksCollection;

  constructor(resource: Resource, config: ResourceHooksConfig = {}) {
    this.resource = resource;

    this._hooks = {} as HooksCollection;
    for (const event of ResourceHooks.HOOK_EVENTS) {
      this._hooks[event] = [];
    }

    const configHooks = config.hooks || {};
    for (const [event, hooksArr] of Object.entries(configHooks)) {
      if (Array.isArray(hooksArr) && this._hooks[event]) {
        for (const fn of hooksArr) {
          const bound = this._bindHook(fn);
          if (bound) {
            this._hooks[event]!.push(bound);
          }
        }
      }
    }
  }

  getHooks(): HooksCollection {
    return this._hooks;
  }

  getHooksForEvent(event: string): BoundHookFunction[] {
    return this._hooks[event] || [];
  }

  addHook(event: string, fn: HookFunction): boolean {
    if (!this._hooks[event]) {
      return false;
    }

    const bound = this._bindHook(fn);
    if (bound) {
      this._hooks[event]!.push(bound);
      return true;
    }
    return false;
  }

  async executeHooks<T = unknown>(event: string, data: T): Promise<T> {
    const hooks = this._hooks[event];
    if (!hooks || hooks.length === 0) {
      return data;
    }

    let result: T = data;
    for (const hook of hooks) {
      result = await hook(result) as T;
    }

    return result;
  }

  private _bindHook(fn: unknown): BoundHookFunction | null {
    if (typeof fn !== 'function') {
      return null;
    }

    const hookFn = fn as BoundHookFunction;
    const original = hookFn.__s3db_original || hookFn;
    const bound = original.bind(this.resource) as BoundHookFunction;

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

  hasHooks(event: string): boolean {
    const hooks = this._hooks[event];
    return hooks !== undefined && hooks.length > 0;
  }

  getHookCount(event: string): number {
    const hooks = this._hooks[event];
    return hooks ? hooks.length : 0;
  }

  clearHooks(event: string): void {
    if (this._hooks[event]) {
      this._hooks[event] = [];
    }
  }

  clearAllHooks(): void {
    for (const event of ResourceHooks.HOOK_EVENTS) {
      this._hooks[event] = [];
    }
  }
}

export default ResourceHooks;
