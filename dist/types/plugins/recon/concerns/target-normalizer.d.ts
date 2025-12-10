/**
 * TargetNormalizer
 *
 * Normalizes target URLs/domains into structured format:
 * - Parses URLs
 * - Extracts host, protocol, port
 * - Handles edge cases
 */
export interface NormalizedTarget {
    original: string;
    host: string;
    protocol: string | null;
    port: number | null;
    path: string | null;
}
export declare class TargetNormalizer {
    static normalize(target: string): NormalizedTarget;
    static defaultPortForProtocol(protocol: string | null): number | null;
    static buildUrl(target: NormalizedTarget): string;
}
//# sourceMappingURL=target-normalizer.d.ts.map