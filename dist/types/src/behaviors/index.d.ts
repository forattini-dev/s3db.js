import type { Behavior, BehaviorName } from './types.js';
export type { Behavior, BehaviorName } from './types.js';
export type { BehaviorHandleInsertParams, BehaviorHandleUpdateParams, BehaviorHandleUpsertParams, BehaviorHandleGetParams, BehaviorResult, BehaviorGetResult, Resource as BehaviorResource, ResourceConfig as BehaviorResourceConfig, SchemaInfo as BehaviorSchemaInfo } from './types.js';
export declare const behaviors: Record<BehaviorName, Behavior>;
export declare function getBehavior(behaviorName: string): Behavior;
export declare const AVAILABLE_BEHAVIORS: BehaviorName[];
export declare const DEFAULT_BEHAVIOR: BehaviorName;
export { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';
//# sourceMappingURL=index.d.ts.map