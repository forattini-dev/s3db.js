export interface AntiBotService {
    name: string;
    detected: boolean;
    indicators: string[];
    scripts?: string[];
    cookies?: string[];
    headers?: string[];
}
export interface AntiBotDetectionResult {
    detected: boolean;
    services: AntiBotService[];
    captchaPresent: boolean;
    captchaType: string | null;
    scripts: string[];
    cookies: string[];
}
export interface FingerprintCapability {
    name: string;
    available: boolean;
    details?: unknown;
}
export interface FingerprintingResult {
    fingerprintingDetected: boolean;
    capabilities: FingerprintCapability[];
    canvasFingerprint: boolean;
    webglFingerprint: boolean;
    audioFingerprint: boolean;
    fontFingerprint: boolean;
    screenFingerprint: boolean;
    hardwareFingerprint: boolean;
    apiCallsDetected: string[];
}
export interface BlockingSignal {
    type: string;
    detected: boolean;
    evidence: string[];
}
export interface BlockingSignalsResult {
    blocked: boolean;
    signals: BlockingSignal[];
    httpStatus?: number;
    responseHeaders?: Record<string, string>;
}
export interface AntiBotAndFingerprintingResult {
    antiBots: AntiBotDetectionResult;
    fingerprinting: FingerprintingResult;
    blocking: BlockingSignalsResult;
    summary: {
        antiBotDetected: boolean;
        fingerprintingAttempted: boolean;
        accessBlocked: boolean;
        riskLevel: 'low' | 'medium' | 'high';
    };
}
interface Page {
    evaluate<T>(fn: () => T): Promise<T>;
    evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
    content(): Promise<string>;
    $$eval<T>(selector: string, fn: (elements: Element[]) => T): Promise<T>;
}
export declare function detectAntiBotServices(page: Page): Promise<AntiBotDetectionResult>;
export declare function detectFingerprinting(page: Page): Promise<FingerprintingResult>;
export declare function detectBlockingSignals(page: Page): Promise<BlockingSignalsResult>;
export declare function detectAntiBotsAndFingerprinting(page: Page): Promise<AntiBotAndFingerprintingResult>;
export {};
//# sourceMappingURL=anti-bot-detector.d.ts.map