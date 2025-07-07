import * as userManaged from './user-managed.js';
import * as enforceLimits from './enforce-limits.js';
import * as dataTruncate from './data-truncate.js';
import * as bodyOverflow from './body-overflow.js';
import * as bodyOnly from './body-only.js';

/**
 * Available behaviors for Resource metadata handling
 */
export const behaviors = {
  'user-managed': userManaged,
  'enforce-limits': enforceLimits,
  'data-truncate': dataTruncate,
  'body-overflow': bodyOverflow,
  'body-only': bodyOnly
};

/**
 * Get behavior implementation by name
 * @param {string} behaviorName - Name of the behavior
 * @returns {Object} Behavior implementation with handler functions
 */
export function getBehavior(behaviorName) {
  const behavior = behaviors[behaviorName];
  if (!behavior) {
    throw new Error(`Unknown behavior: ${behaviorName}. Available behaviors: ${Object.keys(behaviors).join(', ')}`);
  }
  return behavior;
}

/**
 * List of available behavior names
 */
export const AVAILABLE_BEHAVIORS = Object.keys(behaviors);

/**
 * Default behavior name
 */
export const DEFAULT_BEHAVIOR = 'user-managed';