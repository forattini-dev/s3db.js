export const CONTENT_TYPE_DICT = {
    'application/json': 'j',
    'application/xml': 'X',
    'application/ld+json': 'J',
    'text/html': 'H',
    'text/plain': 'T',
    'text/css': 'C',
    'text/javascript': 'V',
    'text/csv': 'v',
    'image/png': 'P',
    'image/jpeg': 'I',
    'image/gif': 'G',
    'image/svg+xml': 'S',
    'image/webp': 'W',
    'application/pdf': 'Q',
    'application/zip': 'z',
    'application/octet-stream': 'o',
    'application/x-www-form-urlencoded': 'u',
    'multipart/form-data': 'F',
    'font/woff': 'w',
    'font/woff2': 'f'
};
export const URL_PREFIX_DICT = {
    '/api/v1/': '@1',
    '/api/v2/': '@2',
    '/api/v3/': '@3',
    '/api/': '@a',
    'https://api.example.com/': '@A',
    'https://api.': '@H',
    'https://www.': '@W',
    'https://': '@h',
    'http://': '@t',
    'https://s3.amazonaws.com/': '@s',
    'https://s3-': '@S',
    'http://localhost:': '@L',
    'http://localhost': '@l',
    '/v1/': '@v',
    '/users/': '@u',
    '/products/': '@p'
};
export const STATUS_MESSAGE_DICT = {
    'processing': 'p',
    'completed': 'c',
    'succeeded': 's',
    'failed': 'f',
    'cancelled': 'x',
    'timeout': 't',
    'retrying': 'r',
    'authorized': 'a',
    'captured': 'K',
    'refunded': 'R',
    'declined': 'd',
    'shipped': 'h',
    'delivered': 'D',
    'returned': 'e',
    'in_transit': 'i',
    'initialized': 'n',
    'terminated': 'm'
};
const CONTENT_TYPE_REVERSE = Object.fromEntries(Object.entries(CONTENT_TYPE_DICT).map(([k, v]) => [v, k]));
const URL_PREFIX_REVERSE = Object.fromEntries(Object.entries(URL_PREFIX_DICT).map(([k, v]) => [v, k]));
const STATUS_MESSAGE_REVERSE = Object.fromEntries(Object.entries(STATUS_MESSAGE_DICT).map(([k, v]) => [v, k]));
const COMBINED_DICT = {
    ...CONTENT_TYPE_DICT,
    ...STATUS_MESSAGE_DICT
};
const COMBINED_REVERSE = {
    ...CONTENT_TYPE_REVERSE,
    ...STATUS_MESSAGE_REVERSE
};
export function dictionaryEncode(value) {
    if (typeof value !== 'string' || !value) {
        return null;
    }
    if (COMBINED_DICT[value]) {
        return {
            encoded: 'd:' + COMBINED_DICT[value],
            encoding: 'dictionary',
            originalLength: value.length,
            encodedLength: 2 + COMBINED_DICT[value].length,
            dictionaryType: 'exact',
            savings: value.length - (2 + COMBINED_DICT[value].length)
        };
    }
    const sortedPrefixes = Object.entries(URL_PREFIX_DICT)
        .sort(([a], [b]) => b.length - a.length);
    for (const [prefix, code] of sortedPrefixes) {
        if (value.startsWith(prefix)) {
            const remainder = value.substring(prefix.length);
            const encoded = 'd:' + code + remainder;
            return {
                encoded,
                encoding: 'dictionary',
                originalLength: value.length,
                encodedLength: encoded.length,
                dictionaryType: 'prefix',
                prefix,
                remainder,
                savings: value.length - encoded.length
            };
        }
    }
    return null;
}
export function dictionaryDecode(encoded) {
    if (typeof encoded !== 'string' || !encoded.startsWith('d:')) {
        return null;
    }
    const payload = encoded.substring(2);
    if (payload.length === 0) {
        return null;
    }
    if (payload.length === 1) {
        const decoded = COMBINED_REVERSE[payload];
        if (decoded) {
            return decoded;
        }
    }
    if (payload.startsWith('@')) {
        const prefixCode = payload.substring(0, 2);
        const remainder = payload.substring(2);
        const prefix = URL_PREFIX_REVERSE[prefixCode];
        if (prefix) {
            return prefix + remainder;
        }
    }
    return null;
}
export function calculateDictionaryCompression(value) {
    const result = dictionaryEncode(value);
    if (!result) {
        return {
            compressible: false,
            original: value.length,
            encoded: value.length,
            savings: 0,
            ratio: 1.0
        };
    }
    return {
        compressible: true,
        original: result.originalLength,
        encoded: result.encodedLength,
        savings: result.savings,
        ratio: result.encodedLength / result.originalLength,
        savingsPercent: ((result.savings / result.originalLength) * 100).toFixed(1) + '%'
    };
}
export function getDictionaryStats() {
    return {
        contentTypes: Object.keys(CONTENT_TYPE_DICT).length,
        urlPrefixes: Object.keys(URL_PREFIX_DICT).length,
        statusMessages: Object.keys(STATUS_MESSAGE_DICT).length,
        total: Object.keys(COMBINED_DICT).length + Object.keys(URL_PREFIX_DICT).length,
        avgSavingsContentType: Object.keys(CONTENT_TYPE_DICT).reduce((sum, key) => sum + (key.length - (2 + CONTENT_TYPE_DICT[key].length)), 0) / Object.keys(CONTENT_TYPE_DICT).length,
        avgSavingsStatus: Object.keys(STATUS_MESSAGE_DICT).reduce((sum, key) => sum + (key.length - (2 + STATUS_MESSAGE_DICT[key].length)), 0) / Object.keys(STATUS_MESSAGE_DICT).length
    };
}
export default {
    dictionaryEncode,
    dictionaryDecode,
    calculateDictionaryCompression,
    getDictionaryStats,
    CONTENT_TYPE_DICT,
    URL_PREFIX_DICT,
    STATUS_MESSAGE_DICT
};
//# sourceMappingURL=dictionary-encoding.js.map