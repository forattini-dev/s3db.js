import { S3dbError } from '../errors.js';

/**
 * StateMachineError - Errors related to state machine operations
 *
 * Used for state machine operations including:
 * - State transitions
 * - State validation
 * - Transition conditions
 * - State machine configuration
 * - Workflow execution
 *
 * @extends S3dbError
 */
export class StateMachineError extends S3dbError {
  constructor(message, details = {}) {
    const { currentState, targetState, resourceName, operation = 'unknown', ...rest } = details;

    let description = details.description;
    if (!description) {
      description = `
State Machine Operation Error

Operation: ${operation}
${currentState ? `Current State: ${currentState}` : ''}
${targetState ? `Target State: ${targetState}` : ''}
${resourceName ? `Resource: ${resourceName}` : ''}

Common causes:
1. Invalid state transition
2. State machine not configured
3. Transition conditions not met
4. State not defined in configuration
5. Missing transition handler

Solution:
Check state machine configuration and valid transitions.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/state-machine.md
`.trim();
    }

    super(message, { ...rest, currentState, targetState, resourceName, operation, description });
  }
}

export default StateMachineError;
