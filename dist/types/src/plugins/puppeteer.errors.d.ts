import { PluginError } from '../errors.js';
export interface PuppeteerErrorDetails {
    pluginName?: string;
    operation?: string;
    statusCode?: number;
    retriable?: boolean;
    suggestion?: string;
    code?: string;
    docs?: string;
    [key: string]: unknown;
}
export declare class PuppeteerError extends PluginError {
    constructor(message: string, details?: PuppeteerErrorDetails);
}
export declare class BrowserPoolError extends PuppeteerError {
    constructor(message: string, details?: PuppeteerErrorDetails);
}
export declare class CookieManagerError extends PuppeteerError {
    constructor(message: string, details?: PuppeteerErrorDetails);
}
export declare class NavigationError extends PuppeteerError {
    constructor(message: string, details?: PuppeteerErrorDetails);
}
export declare class HumanBehaviorError extends PuppeteerError {
    constructor(message: string, details?: PuppeteerErrorDetails);
}
export declare class SessionError extends PuppeteerError {
    constructor(message: string, details?: PuppeteerErrorDetails);
}
//# sourceMappingURL=puppeteer.errors.d.ts.map