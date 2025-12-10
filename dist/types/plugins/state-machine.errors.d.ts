import { S3dbError } from '../errors.js';
export interface StateMachineErrorDetails {
    currentState?: string;
    targetState?: string;
    resourceName?: string;
    operation?: string;
    retriable?: boolean;
    description?: string;
    [key: string]: unknown;
}
export declare class StateMachineError extends S3dbError {
    constructor(message: string, details?: StateMachineErrorDetails);
}
export default StateMachineError;
//# sourceMappingURL=state-machine.errors.d.ts.map