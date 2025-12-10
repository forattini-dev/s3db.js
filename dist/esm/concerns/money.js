/**
 * Money Encoding/Decoding - Integer-based (Banking Standard)
 *
 * IMPORTANT: Money should NEVER use floats/decimals due to precision errors.
 * Always store as integers in smallest currency unit (cents, satoshis, etc).
 */
import { encode, decode } from './base62.js';
import { ValidationError } from '../errors.js';
export const CURRENCY_DECIMALS = {
    // Fiat with cents (2 decimals)
    'USD': 2, 'BRL': 2, 'EUR': 2, 'GBP': 2, 'CAD': 2, 'AUD': 2,
    'MXN': 2, 'ARS': 2, 'COP': 2, 'PEN': 2, 'UYU': 2,
    'CHF': 2, 'SEK': 2, 'NOK': 2, 'DKK': 2, 'PLN': 2, 'CZK': 2,
    'HUF': 2, 'RON': 2, 'BGN': 2, 'HRK': 2, 'RSD': 2, 'TRY': 2,
    'ZAR': 2, 'EGP': 2, 'NGN': 2, 'KES': 2, 'GHS': 2,
    'INR': 2, 'PKR': 2, 'BDT': 2, 'LKR': 2, 'NPR': 2,
    'THB': 2, 'MYR': 2, 'SGD': 2, 'PHP': 2, 'IDR': 2,
    'CNY': 2, 'HKD': 2, 'TWD': 2,
    'ILS': 2, 'SAR': 2, 'AED': 2, 'QAR': 2, 'KWD': 3,
    'RUB': 2, 'UAH': 2, 'KZT': 2,
    // Fiat without decimals
    'JPY': 0,
    'KRW': 0,
    'VND': 0,
    'CLP': 0,
    'ISK': 0,
    'PYG': 0,
    // Cryptocurrencies
    'BTC': 8,
    'ETH': 18,
    'GWEI': 9,
    'USDT': 6,
    'USDC': 6,
    'BUSD': 18,
    'DAI': 18,
    'BNB': 18,
    'XRP': 6,
    'ADA': 6,
    'SOL': 9,
    'MATIC': 18,
    'AVAX': 18,
    'DOT': 10,
    'LINK': 18,
    'UNI': 18,
};
/**
 * Get decimal places for a currency
 */
export function getCurrencyDecimals(currency) {
    const normalized = currency.toUpperCase();
    return CURRENCY_DECIMALS[normalized] ?? 2;
}
/**
 * Encode money value to integer-based base62
 */
export function encodeMoney(value, currency = 'USD') {
    if (value === null || value === undefined)
        return value;
    if (typeof value !== 'number' || isNaN(value))
        return value;
    if (!isFinite(value))
        return value;
    if (value < 0) {
        throw new ValidationError('Money value cannot be negative', {
            field: 'value',
            value,
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide a non-negative monetary value or store debts in a separate field.'
        });
    }
    const decimals = getCurrencyDecimals(currency);
    const multiplier = Math.pow(10, decimals);
    const integerValue = Math.round(value * multiplier);
    return '$' + encode(integerValue);
}
/**
 * Decode money from base62 to decimal value
 */
export function decodeMoney(encoded, currency = 'USD') {
    if (typeof encoded !== 'string')
        return encoded;
    if (!encoded.startsWith('$'))
        return encoded;
    const integerValue = decode(encoded.slice(1));
    if (isNaN(integerValue))
        return NaN;
    const decimals = getCurrencyDecimals(currency);
    const divisor = Math.pow(10, decimals);
    return integerValue / divisor;
}
/**
 * Validate if a currency code is supported
 */
export function isSupportedCurrency(currency) {
    const normalized = currency.toUpperCase();
    return normalized in CURRENCY_DECIMALS;
}
/**
 * Get list of all supported currencies
 */
export function getSupportedCurrencies() {
    return Object.keys(CURRENCY_DECIMALS);
}
/**
 * Format money value for display
 */
export function formatMoney(value, currency = 'USD', locale = 'en-US') {
    const decimals = getCurrencyDecimals(currency);
    if (decimals <= 3 && currency !== 'BTC' && !currency.includes('USDT')) {
        try {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: currency,
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            }).format(value);
        }
        catch {
            return `${value.toFixed(decimals)} ${currency}`;
        }
    }
    return `${value.toFixed(decimals)} ${currency}`;
}
//# sourceMappingURL=money.js.map