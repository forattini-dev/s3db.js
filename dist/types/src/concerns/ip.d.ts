/**
 * IP Address Encoding/Decoding Utilities
 *
 * Provides compact binary encoding for IPv4 and IPv6 addresses
 * to save space in S3 metadata.
 */
export type IPVersion = 'ipv4' | 'ipv6';
export interface IPSavingsResult {
    version: IPVersion | null;
    originalSize: number;
    encodedSize: number;
    savings: number;
    savingsPercent?: string;
}
/**
 * Validate IPv4 address format
 */
export declare function isValidIPv4(ip: string): boolean;
/**
 * Validate IPv6 address format
 */
export declare function isValidIPv6(ip: string): boolean;
/**
 * Encode IPv4 address to Base64 binary representation
 */
export declare function encodeIPv4(ip: string): string;
/**
 * Decode Base64 binary to IPv4 address
 */
export declare function decodeIPv4(encoded: string): string;
/**
 * Normalize IPv6 address to full expanded form
 */
export declare function expandIPv6(ip: string): string;
/**
 * Compress IPv6 address (remove leading zeros and use ::)
 */
export declare function compressIPv6(ip: string): string;
/**
 * Encode IPv6 address to Base64 binary representation
 */
export declare function encodeIPv6(ip: string): string;
/**
 * Decode Base64 binary to IPv6 address
 */
export declare function decodeIPv6(encoded: string, compress?: boolean): string;
/**
 * Detect IP version from string
 */
export declare function detectIPVersion(ip: string): IPVersion | null;
/**
 * Calculate savings percentage for IP encoding
 */
export declare function calculateIPSavings(ip: string): IPSavingsResult;
declare const _default: {
    isValidIPv4: typeof isValidIPv4;
    isValidIPv6: typeof isValidIPv6;
    encodeIPv4: typeof encodeIPv4;
    decodeIPv4: typeof decodeIPv4;
    encodeIPv6: typeof encodeIPv6;
    decodeIPv6: typeof decodeIPv6;
    expandIPv6: typeof expandIPv6;
    compressIPv6: typeof compressIPv6;
    detectIPVersion: typeof detectIPVersion;
    calculateIPSavings: typeof calculateIPSavings;
};
export default _default;
//# sourceMappingURL=ip.d.ts.map