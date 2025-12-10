import * as userManaged from './user-managed.js';
import * as enforceLimits from './enforce-limits.js';
import * as dataTruncate from './truncate-data.js';
import * as bodyOverflow from './body-overflow.js';
import * as bodyOnly from './body-only.js';
import { BehaviorError } from '../errors.js';
import type { Behavior, BehaviorName } from './types.js';

export type { Behavior, BehaviorName } from './types.js';
export type {
  BehaviorHandleInsertParams,
  BehaviorHandleUpdateParams,
  BehaviorHandleUpsertParams,
  BehaviorHandleGetParams,
  BehaviorResult,
  BehaviorGetResult,
  Resource as BehaviorResource,
  ResourceConfig as BehaviorResourceConfig,
  SchemaInfo as BehaviorSchemaInfo
} from './types.js';

export const behaviors: Record<BehaviorName, Behavior> = {
  'user-managed': userManaged as Behavior,
  'enforce-limits': enforceLimits as Behavior,
  'truncate-data': dataTruncate as Behavior,
  'body-overflow': bodyOverflow as Behavior,
  'body-only': bodyOnly as Behavior
};

export function getBehavior(behaviorName: string): Behavior {
  const behavior = behaviors[behaviorName as BehaviorName];
  if (!behavior) {
    throw new BehaviorError(`Unknown behavior: ${behaviorName}`, {
      behavior: behaviorName,
      availableBehaviors: Object.keys(behaviors),
      operation: 'getBehavior'
    });
  }
  return behavior;
}

export const AVAILABLE_BEHAVIORS: BehaviorName[] = Object.keys(behaviors) as BehaviorName[];

export const DEFAULT_BEHAVIOR: BehaviorName = 'user-managed';

export { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';
