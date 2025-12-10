import { PluginError } from '../errors.js';
export interface CookieFarmErrorDetails {
    pluginName?: string;
    operation?: string;
    statusCode?: number;
    retriable?: boolean;
    suggestion?: string;
    code?: string;
    personaId?: string;
    docs?: string;
    [key: string]: unknown;
}
export declare class CookieFarmError extends PluginError {
    constructor(message: string, details?: CookieFarmErrorDetails);
}
export declare class PersonaNotFoundError extends CookieFarmError {
    constructor(personaId: string, details?: CookieFarmErrorDetails);
}
export declare class WarmupError extends CookieFarmError {
    constructor(message: string, details?: CookieFarmErrorDetails);
}
export declare class GenerationError extends CookieFarmError {
    constructor(message: string, details?: CookieFarmErrorDetails);
}
export declare class QualityCalculationError extends CookieFarmError {
    constructor(message: string, details?: CookieFarmErrorDetails);
}
//# sourceMappingURL=cookie-farm.errors.d.ts.map