/**
 * Money Encoding/Decoding - Integer-based (Banking Standard)
 *
 * IMPORTANT: Money should NEVER use floats/decimals due to precision errors.
 * Always store as integers in smallest currency unit (cents, satoshis, etc).
 */
export declare const CURRENCY_DECIMALS: Record<string, number>;
/**
 * Get decimal places for a currency
 */
export declare function getCurrencyDecimals(currency: string): number;
/**
 * Encode money value to integer-based base62
 */
export declare function encodeMoney(value: number | null | undefined, currency?: string): string | null | undefined;
/**
 * Decode money from base62 to decimal value
 */
export declare function decodeMoney(encoded: string | unknown, currency?: string): number | unknown;
/**
 * Validate if a currency code is supported
 */
export declare function isSupportedCurrency(currency: string): boolean;
/**
 * Get list of all supported currencies
 */
export declare function getSupportedCurrencies(): string[];
/**
 * Format money value for display
 */
export declare function formatMoney(value: number, currency?: string, locale?: string): string;
//# sourceMappingURL=money.d.ts.map