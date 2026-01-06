/**
 * URL-safe alphabet (64 chars).
 * Entropy: 6 bits per character
 * 21 chars = 126 bits of entropy
 */
export declare const URL_SAFE = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
/**
 * URL-safe alphabet without special chars (62 chars).
 * Alphanumeric only: a-z, A-Z, 0-9
 * Entropy: ~5.95 bits per character
 * 22 chars = ~131 bits of entropy
 */
export declare const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/**
 * Lowercase alphanumeric (36 chars).
 * Entropy: ~5.17 bits per character
 * 25 chars = ~129 bits of entropy
 */
export declare const ALPHANUMERIC_LOWER = "0123456789abcdefghijklmnopqrstuvwxyz";
/**
 * Uppercase alphanumeric (36 chars).
 * Entropy: ~5.17 bits per character
 */
export declare const ALPHANUMERIC_UPPER = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/**
 * Hexadecimal lowercase (16 chars).
 * Entropy: 4 bits per character
 * 32 chars = 128 bits of entropy
 */
export declare const HEX_LOWER = "0123456789abcdef";
/**
 * Hexadecimal uppercase (16 chars).
 */
export declare const HEX_UPPER = "0123456789ABCDEF";
/**
 * Crockford Base32 (32 chars) - Used by ULID.
 * Excludes I, L, O, U to avoid confusion.
 * Entropy: 5 bits per character
 * 26 chars = 130 bits of entropy
 */
export declare const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/**
 * Base58 Bitcoin alphabet (58 chars).
 * Excludes 0, O, I, l to avoid confusion.
 * Entropy: ~5.86 bits per character
 */
export declare const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/**
 * Base64 URL-safe alphabet (64 chars).
 * Standard RFC 4648 with - and _ instead of + and /
 * Entropy: 6 bits per character
 */
export declare const BASE64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/**
 * Numeric only (10 chars).
 * Entropy: ~3.32 bits per character
 * 39 chars = ~129 bits of entropy
 */
export declare const NUMERIC = "0123456789";
/**
 * Lowercase letters only (26 chars).
 * Entropy: ~4.7 bits per character
 */
export declare const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
/**
 * Uppercase letters only (26 chars).
 */
export declare const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/**
 * Human-readable alphabet (32 chars).
 * Excludes similar-looking characters: 0, O, I, l, 1
 * Good for manual entry scenarios.
 * Entropy: 5 bits per character
 */
export declare const HUMAN_READABLE = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
/**
 * No-look-alike lowercase (23 chars).
 * Excludes: 0, 1, l, o, i
 * Entropy: ~4.52 bits per character
 */
export declare const NO_LOOKALIKE_LOWER = "23456789abcdefghjkmnpqrstuvwxyz";
/**
 * Binary alphabet (2 chars).
 * Entropy: 1 bit per character
 */
export declare const BINARY = "01";
/**
 * Emoji alphabet (64 emojis) - Fun but use with caution.
 * UTF-8 encoding varies (2-4 bytes per emoji).
 */
export declare const EMOJI = "\uD83D\uDE80\uD83C\uDF89\uD83D\uDCA1\uD83D\uDD25\u26A1\uD83C\uDF1F\uD83D\uDC8E\uD83C\uDFAF\uD83C\uDFC6\uD83C\uDFA8\uD83C\uDFAD\uD83C\uDFAA\uD83C\uDFA2\uD83C\uDFA1\uD83C\uDFA0\uD83C\uDFF0\uD83D\uDDFC\uD83D\uDDFD\u26E9\uFE0F\uD83C\uDFEF\uD83C\uDFDF\uFE0F\uD83C\uDFB8\uD83C\uDFBA\uD83C\uDFBB\uD83E\uDD41\uD83C\uDFB9\uD83C\uDFBC\uD83C\uDFA4\uD83C\uDFA7\uD83C\uDFAC\uD83C\uDFA5\uD83D\uDCF8\uD83D\uDD2E\uD83C\uDFB1\uD83C\uDFB2\uD83C\uDFB0\uD83C\uDCCF\uD83C\uDC04\uD83C\uDFB4\uD83C\uDFAD\uD83C\uDFA8\uD83D\uDDBC\uFE0F\uD83C\uDFAA\uD83C\uDFA2\uD83C\uDFA1\uD83C\uDFA0\uD83C\uDFF0\uD83D\uDDFC\uD83D\uDDFD\u26E9\uFE0F\uD83C\uDFEF\uD83C\uDFDF\uFE0F\uD83C\uDFB8\uD83C\uDFBA\uD83C\uDFBB\uD83E\uDD41\uD83C\uDFB9\uD83C\uDFBC\uD83C\uDFA4\uD83C\uDFA7";
export declare const alphabets: {
    readonly URL_SAFE: "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
    readonly ALPHANUMERIC: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    readonly ALPHANUMERIC_LOWER: "0123456789abcdefghijklmnopqrstuvwxyz";
    readonly ALPHANUMERIC_UPPER: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    readonly HEX_LOWER: "0123456789abcdef";
    readonly HEX_UPPER: "0123456789ABCDEF";
    readonly CROCKFORD_BASE32: "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    readonly BASE58: "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    readonly BASE64_URL: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    readonly NUMERIC: "0123456789";
    readonly LOWERCASE: "abcdefghijklmnopqrstuvwxyz";
    readonly UPPERCASE: "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    readonly HUMAN_READABLE: "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
    readonly NO_LOOKALIKE_LOWER: "23456789abcdefghjkmnpqrstuvwxyz";
    readonly BINARY: "01";
    readonly EMOJI: "🚀🎉💡🔥⚡🌟💎🎯🏆🎨🎭🎪🎢🎡🎠🏰🗼🗽⛩️🏯🏟️🎸🎺🎻🥁🎹🎼🎤🎧🎬🎥📸🔮🎱🎲🎰🃏🀄🎴🎭🎨🖼️🎪🎢🎡🎠🏰🗼🗽⛩️🏯🏟️🎸🎺🎻🥁🎹🎼🎤🎧";
};
export type AlphabetName = keyof typeof alphabets;
/**
 * Get alphabet by name or return custom alphabet string.
 */
export declare function getAlphabet(nameOrCustom: AlphabetName | string): string;
/**
 * Calculate recommended ID length for target entropy bits.
 */
export declare function recommendedLength(alphabet: string, targetEntropyBits?: number): number;
/**
 * Validate an alphabet string.
 * Returns null if valid, error message if invalid.
 */
export declare function validateAlphabet(alphabet: string): string | null;
export default alphabets;
//# sourceMappingURL=alphabets.d.ts.map