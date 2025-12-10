import { PluginError } from '../../errors.js';
export interface SMTPErrorOptions {
    retriable?: boolean;
    statusCode?: number;
    originalError?: Error | null;
    suggestion?: string;
    [key: string]: unknown;
}
export declare class SMTPError extends PluginError {
    originalError: Error | null;
    constructor(message: string, options?: SMTPErrorOptions);
}
export declare class AuthenticationError extends SMTPError {
    constructor(message: string, options?: SMTPErrorOptions);
}
export declare class TemplateError extends SMTPError {
    constructor(message: string, options?: SMTPErrorOptions);
}
export declare class RateLimitError extends SMTPError {
    constructor(message: string, options?: SMTPErrorOptions);
}
export declare class RecipientError extends SMTPError {
    constructor(message: string, options?: SMTPErrorOptions);
}
export declare class ConnectionError extends SMTPError {
    constructor(message: string, options?: SMTPErrorOptions);
}
export declare class AttachmentError extends SMTPError {
    constructor(message: string, options?: SMTPErrorOptions);
}
//# sourceMappingURL=errors.d.ts.map