import * as userManaged from './user-managed.js';
import * as enforceLimits from './enforce-limits.js';
import * as dataTruncate from './truncate-data.js';
import * as bodyOverflow from './body-overflow.js';
import * as bodyOnly from './body-only.js';
import { BehaviorError } from '../errors.js';
export const behaviors = {
    'user-managed': userManaged,
    'enforce-limits': enforceLimits,
    'truncate-data': dataTruncate,
    'body-overflow': bodyOverflow,
    'body-only': bodyOnly
};
export function getBehavior(behaviorName) {
    const behavior = behaviors[behaviorName];
    if (!behavior) {
        throw new BehaviorError(`Unknown behavior: ${behaviorName}`, {
            behavior: behaviorName,
            availableBehaviors: Object.keys(behaviors),
            operation: 'getBehavior'
        });
    }
    return behavior;
}
export const AVAILABLE_BEHAVIORS = Object.keys(behaviors);
export const DEFAULT_BEHAVIOR = 'user-managed';
export { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';
//# sourceMappingURL=index.js.map