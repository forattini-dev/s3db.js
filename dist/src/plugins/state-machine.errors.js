import { S3dbError } from '../errors.js';
export class StateMachineError extends S3dbError {
    constructor(message, details = {}) {
        const { currentState, targetState, resourceName, operation = 'unknown', retriable, ...rest } = details;
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
        if (retriable !== undefined) {
            this.retriable = retriable;
        }
    }
}
export default StateMachineError;
//# sourceMappingURL=state-machine.errors.js.map