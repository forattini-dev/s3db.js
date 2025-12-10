function looksLikeBase64(str) {
    if (!str || str.length < 4)
        return false;
    return /^[A-Za-z0-9+/]+=*$/.test(str) && str.length % 4 === 0;
}
export function optimizedEncode(value) {
    if (value === null)
        return 'null';
    if (value === undefined)
        return 'undefined';
    const str = String(value);
    if (str === '')
        return '';
    if (/^[\x20-\x7E]*$/.test(str)) {
        if (looksLikeBase64(str)) {
            return '!' + str;
        }
        return str;
    }
    const hasMultibyte = /[^\x00-\xFF]/.test(str);
    if (hasMultibyte) {
        return Buffer.from(str, 'utf8').toString('base64');
    }
    const base64 = Buffer.from(str, 'utf8').toString('base64');
    const urlEncoded = encodeURIComponent(str);
    if (urlEncoded.length <= base64.length) {
        return '%' + urlEncoded;
    }
    return base64;
}
export function optimizedDecode(value) {
    if (value === 'null')
        return null;
    if (value === 'undefined')
        return undefined;
    if (value === '' || value === null || value === undefined)
        return value;
    const str = String(value);
    if (str.startsWith('!')) {
        return str.substring(1);
    }
    if (str.startsWith('%')) {
        try {
            return decodeURIComponent(str.substring(1));
        }
        catch {
            return str;
        }
    }
    if (looksLikeBase64(str)) {
        try {
            const decoded = Buffer.from(str, 'base64').toString('utf8');
            if (/[^\x00-\x7F]/.test(decoded)) {
                if (Buffer.from(decoded, 'utf8').toString('base64') === str) {
                    return decoded;
                }
            }
        }
        catch {
            // Not base64
        }
    }
    return str;
}
export function compareEncodings(value) {
    const str = String(value);
    const originalBytes = Buffer.byteLength(str, 'utf8');
    const base64 = Buffer.from(str, 'utf8').toString('base64');
    const base64WithPrefix = 'b:' + base64;
    const urlEncoded = encodeURIComponent(str);
    const urlWithPrefix = 'u:' + urlEncoded;
    const optimized = optimizedEncode(value);
    let optimizedMethod;
    if (optimized === str) {
        optimizedMethod = 'none';
    }
    else if (optimized.startsWith('!')) {
        optimizedMethod = 'ascii-marked';
    }
    else if (optimized.startsWith('%')) {
        optimizedMethod = 'url';
    }
    else if (looksLikeBase64(optimized)) {
        optimizedMethod = 'base64';
    }
    else {
        optimizedMethod = 'unknown';
    }
    return {
        original: originalBytes,
        base64Pure: base64.length,
        base64Prefixed: base64WithPrefix.length,
        urlPure: urlEncoded.length,
        urlPrefixed: urlWithPrefix.length,
        optimized: optimized.length,
        optimizedMethod
    };
}
//# sourceMappingURL=optimized-encoding.js.map