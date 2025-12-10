export interface IFrameData {
    src: string | null;
    title: string | null;
    name: string | null;
    id: string | null;
    className: string | null;
    width: string | null;
    height: string | null;
    sandbox: string | null;
    frameBorder: string | null;
    loading: string | null;
    referrerPolicy: string | null;
    allow: string | null;
    credentialless: boolean;
    visible: {
        offsetParent: boolean;
        clientHeight: number;
        clientWidth: number;
    };
}
export interface CategorizedIFrames {
    advertising: IFrameData[];
    analytics: IFrameData[];
    social: IFrameData[];
    embedded_content: IFrameData[];
    unknown: IFrameData[];
}
export interface IFrameAnalysisResult {
    present: boolean;
    count: number;
    iframes: IFrameData[];
    categorized: CategorizedIFrames;
    error?: string;
}
export interface TrackingPixel {
    type: 'img' | 'script_tracking';
    src?: string;
    width?: number;
    height?: number;
    alt?: string | null;
    service?: string;
    snippet?: string;
}
export interface TrackingAttribute {
    tag: string;
    attributes: Record<string, string>;
}
export interface TrackingPixelResult {
    present: boolean;
    detectedServices: string[];
    pixelCount: number;
    trackingScriptCount: number;
    trackingAttributeCount: number;
    pixels: TrackingPixel[];
    services: Record<string, TrackingPixel[]>;
    trackingAttributes: TrackingAttribute[];
    error?: string;
}
interface Page {
    evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
    client?: {
        send(method: string): Promise<unknown>;
    };
}
interface Logger {
    error(message: string, ...args: unknown[]): void;
}
export declare function setLogger(l: Logger): void;
export declare function analyzeIFrames(page: Page): Promise<IFrameAnalysisResult>;
export declare function detectTrackingPixels(page: Page): Promise<TrackingPixelResult>;
export {};
//# sourceMappingURL=content-analyzer.d.ts.map