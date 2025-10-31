/**
 * Money Encoding/Decoding - Integer-based (Banking Standard)
 *
 * IMPORTANT: Money should NEVER use floats/decimals due to precision errors.
 * Always store as integers in smallest currency unit (cents, satoshis, etc).
 *
 * Examples:
 *   $19.99 USD → 1999 cents → encoded as "$w7"
 *   0.00012345 BTC → 12345 satoshis → encoded as "$3d9"
 *
 * Benefits:
 * - Zero precision loss (no 0.1 + 0.2 = 0.30000004 bugs)
 * - Faster integer arithmetic
 * - Banking industry standard
 * - 40-67% compression vs JSON floats
 */

import { encode, decode } from './base62.js';
import { ValidationError } from '../errors.js';

/**
 * Currency decimal places (number of decimals in smallest unit)
 *
 * Fiat currencies:
 * - Most: 2 decimals (cents)
 * - Some: 0 decimals (yen, won)
 *
 * Cryptocurrencies:
 * - BTC: 8 decimals (satoshis)
 * - ETH: 18 decimals (wei) - but commonly use 9 (gwei)
 * - Stablecoins: 6-8 decimals
 */
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
  'JPY': 0,  // Japanese Yen
  'KRW': 0,  // Korean Won
  'VND': 0,  // Vietnamese Dong
  'CLP': 0,  // Chilean Peso
  'ISK': 0,  // Icelandic Króna
  'PYG': 0,  // Paraguayan Guaraní

  // Cryptocurrencies
  'BTC': 8,   // Bitcoin (satoshis)
  'ETH': 18,  // Ethereum (wei) - often use 9 for gwei
  'GWEI': 9,  // Ethereum gwei (common unit)
  'USDT': 6,  // Tether
  'USDC': 6,  // USD Coin
  'BUSD': 18, // Binance USD
  'DAI': 18,  // Dai
  'BNB': 18,  // Binance Coin
  'XRP': 6,   // Ripple
  'ADA': 6,   // Cardano
  'SOL': 9,   // Solana
  'MATIC': 18, // Polygon
  'AVAX': 18, // Avalanche
  'DOT': 10,  // Polkadot
  'LINK': 18, // Chainlink
  'UNI': 18,  // Uniswap
};

/**
 * Get decimal places for a currency
 * @param {string} currency - Currency code (e.g., 'USD', 'BTC')
 * @returns {number} Number of decimal places
 */
export function getCurrencyDecimals(currency) {
  const normalized = currency.toUpperCase();
  return CURRENCY_DECIMALS[normalized] ?? 2; // Default to 2 (cents)
}

/**
 * Encode money value to integer-based base62
 *
 * @param {number} value - Decimal value (e.g., 19.99)
 * @param {string} currency - Currency code (default: 'USD')
 * @returns {string} Encoded string with '$' prefix
 *
 * @throws {Error} If value is negative
 *
 * @example
 * encodeMoney(19.99, 'USD')     // → "$w7" (1999 cents)
 * encodeMoney(1000.50, 'BRL')   // → "$6Dl" (100050 centavos)
 * encodeMoney(0.00012345, 'BTC') // → "$3d9" (12345 satoshis)
 */
export function encodeMoney(value, currency = 'USD') {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'number' || isNaN(value)) return value;
  if (!isFinite(value)) return value;

  // Money cannot be negative (validation should happen at schema level)
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

  // Convert to smallest unit (cents, satoshis, wei, etc)
  // Use Math.round to handle floating point precision issues
  const integerValue = Math.round(value * multiplier);

  // Encode as pure integer using base62
  return '$' + encode(integerValue);
}

/**
 * Decode money from base62 to decimal value
 *
 * @param {string} encoded - Encoded string (must start with '$')
 * @param {string} currency - Currency code (default: 'USD')
 * @returns {number} Decoded decimal value
 *
 * @example
 * decodeMoney('$w7', 'USD')     // → 19.99
 * decodeMoney('$6Dl', 'BRL')    // → 1000.50
 * decodeMoney('$3d9', 'BTC')    // → 0.00012345
 */
export function decodeMoney(encoded, currency = 'USD') {
  if (typeof encoded !== 'string') return encoded;
  if (!encoded.startsWith('$')) return encoded;

  const integerValue = decode(encoded.slice(1));
  if (isNaN(integerValue)) return NaN;

  const decimals = getCurrencyDecimals(currency);
  const divisor = Math.pow(10, decimals);

  // Convert back to decimal
  return integerValue / divisor;
}

/**
 * Validate if a currency code is supported
 * @param {string} currency - Currency code
 * @returns {boolean} True if supported
 */
export function isSupportedCurrency(currency) {
  const normalized = currency.toUpperCase();
  return normalized in CURRENCY_DECIMALS;
}

/**
 * Get list of all supported currencies
 * @returns {string[]} Array of currency codes
 */
export function getSupportedCurrencies() {
  return Object.keys(CURRENCY_DECIMALS);
}

/**
 * Format money value for display
 * @param {number} value - Decimal value
 * @param {string} currency - Currency code
 * @param {string} locale - Locale for formatting (default: 'en-US')
 * @returns {string} Formatted money string
 *
 * @example
 * formatMoney(19.99, 'USD')     // → "$19.99"
 * formatMoney(1000.50, 'BRL', 'pt-BR')  // → "R$ 1.000,50"
 * formatMoney(0.00012345, 'BTC') // → "0.00012345 BTC"
 */
export function formatMoney(value, currency = 'USD', locale = 'en-US') {
  const decimals = getCurrencyDecimals(currency);

  // For fiat currencies, use Intl.NumberFormat
  if (decimals <= 3 && currency !== 'BTC' && !currency.includes('USDT')) {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value);
    } catch (err) {
      // Fallback for unsupported currencies
      return `${value.toFixed(decimals)} ${currency}`;
    }
  }

  // For crypto, just show the value with correct decimals
  return `${value.toFixed(decimals)} ${currency}`;
}
