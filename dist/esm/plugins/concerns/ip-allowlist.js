function ipToInt(ip) {
    return ip.split('.').reduce((int, octet) => (int << 8) + parseInt(octet, 10), 0) >>> 0;
}
function isIPv6(ip) {
    return ip.includes(':');
}
function normalizeIPv6(ip) {
    if (ip.startsWith('::ffff:')) {
        return ip.substring(7);
    }
    const parts = ip.split('::');
    if (parts.length === 2) {
        const left = parts[0] ? parts[0].split(':') : [];
        const right = parts[1] ? parts[1].split(':') : [];
        const missing = 8 - left.length - right.length;
        const middle = Array(missing).fill('0000');
        return [...left, ...middle, ...right].join(':');
    }
    return ip;
}
function isIPv6InRange(ip, range) {
    const [rangeIp, prefixLen] = range.split('/');
    const prefix = parseInt(prefixLen ?? '128', 10);
    const normalizedIp = normalizeIPv6(ip);
    const normalizedRange = normalizeIPv6(rangeIp ?? '');
    const ipBin = normalizedIp.split(':').map(h => parseInt(h || '0', 16).toString(2).padStart(16, '0')).join('');
    const rangeBin = normalizedRange.split(':').map(h => parseInt(h || '0', 16).toString(2).padStart(16, '0')).join('');
    return ipBin.substring(0, prefix) === rangeBin.substring(0, prefix);
}
function isIPv4InRange(ip, range) {
    if (range.includes('/')) {
        const [rangeIp, prefixLen] = range.split('/');
        const prefix = parseInt(prefixLen ?? '32', 10);
        const mask = (-1 << (32 - prefix)) >>> 0;
        const ipInt = ipToInt(ip);
        const rangeInt = ipToInt(rangeIp ?? '');
        return (ipInt & mask) === (rangeInt & mask);
    }
    else {
        return ip === range;
    }
}
export function isIpAllowed(ip, allowlist = []) {
    if (!ip || !Array.isArray(allowlist) || allowlist.length === 0) {
        return false;
    }
    let normalizedIp = ip;
    if (isIPv6(ip)) {
        if (ip.startsWith('::ffff:')) {
            normalizedIp = ip.substring(7);
        }
        else {
            normalizedIp = normalizeIPv6(ip);
        }
    }
    for (const range of allowlist) {
        if (!range)
            continue;
        if (isIPv6(range)) {
            if (isIPv6(normalizedIp) && isIPv6InRange(normalizedIp, range)) {
                return true;
            }
        }
        else {
            if (!isIPv6(normalizedIp) && isIPv4InRange(normalizedIp, range)) {
                return true;
            }
        }
    }
    return false;
}
export function getClientIp(c) {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    const realIp = c.req.header('x-real-ip');
    if (realIp) {
        return realIp.trim();
    }
    const req = c.req.raw;
    if (req?.socket?.remoteAddress) {
        return req.socket.remoteAddress;
    }
    return null;
}
export default {
    isIpAllowed,
    getClientIp
};
//# sourceMappingURL=ip-allowlist.js.map