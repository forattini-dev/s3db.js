import * as userManagement from './user-management.js';
import * as enforceLimits from './enforce-limits.js';
import * as dataTruncate from './data-truncate.js';
import * as bodyOverflow from './body-overflow.js';

/**
 * Available behaviors for Resource metadata handling
 */
export const behaviors = {
  'user-management': userManagement,
  'enforce-limits': enforceLimits,
  'data-truncate': dataTruncate,
  'body-overflow': bodyOverflow
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
export const DEFAULT_BEHAVIOR = 'user-management';