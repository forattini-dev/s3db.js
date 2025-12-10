export interface TechDetectorConfig {
    detectFrameworks?: boolean;
    detectAnalytics?: boolean;
    detectMarketing?: boolean;
    detectCDN?: boolean;
    detectWebServer?: boolean;
    detectCMS?: boolean;
}
export interface TechSignature {
    indicators?: string[];
    patterns?: RegExp[];
    headers?: string[];
}
export interface TechSignatures {
    frameworks: Record<string, TechSignature>;
    analytics: Record<string, TechSignature>;
    marketing: Record<string, TechSignature>;
    cdn: Record<string, TechSignature>;
    webServer: Record<string, TechSignature>;
    cms: Record<string, TechSignature>;
    libraries: Record<string, TechSignature>;
}
export interface TechDetectionResult {
    frameworks: string[];
    analytics: string[];
    marketing: string[];
    cdn: string[];
    webServers: string[];
    cms: string[];
    libraries: string[];
}
export declare class TechDetector {
    config: Required<TechDetectorConfig>;
    signatures: TechSignatures;
    constructor(config?: TechDetectorConfig);
    fingerprintSelective(html: string, activities?: string[]): TechDetectionResult;
    fingerprint(html: string): TechDetectionResult;
    private _detectFrameworks;
    private _detectAnalytics;
    private _detectMarketing;
    private _detectCDN;
    private _detectWebServers;
    private _detectCMS;
    private _detectLibraries;
    private _detectCategory;
    private _isDetected;
}
export default TechDetector;
//# sourceMappingURL=tech-detector.d.ts.map