import type { MiddlewareHandler } from 'hono';
export interface OpenGraphDefaults {
    siteName?: string;
    locale?: string;
    type?: string;
    twitterCard?: string;
    twitterSite?: string | null;
    defaultImage?: string | null;
}
export interface OpenGraphData extends OpenGraphDefaults {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    imageAlt?: string;
    imageWidth?: number;
    imageHeight?: number;
    twitterCreator?: string;
}
export declare class OpenGraphHelper {
    private defaults;
    constructor(defaults?: OpenGraphDefaults);
    generateTags(data?: OpenGraphData): string;
    middleware(): MiddlewareHandler;
    private _escape;
}
export default OpenGraphHelper;
//# sourceMappingURL=opengraph-helper.d.ts.map