import { createHash } from 'crypto';
export function generateETag(data, options = {}) {
    const { weak = true, lastModified } = options;
    const content = typeof data === 'string' ? data : JSON.stringify(data);
    const hash = createHash('sha256')
        .update(content)
        .digest('hex')
        .substring(0, 16);
    const timestamp = lastModified
        ? `-${new Date(lastModified).getTime()}`
        : '';
    const prefix = weak ? 'W/' : '';
    return `${prefix}"${hash}${timestamp}"`;
}
export function parseETag(etagHeader) {
    if (!etagHeader)
        return null;
    const weak = etagHeader.startsWith('W/');
    const raw = etagHeader.replace(/^W\//, '').replace(/"/g, '');
    const parts = raw.split('-');
    return {
        weak,
        hash: parts[0],
        timestamp: parts[1] ? parseInt(parts[1], 10) : null,
        raw: etagHeader
    };
}
export function etagMatches(etag1, etag2, options = {}) {
    const { weakComparison = true } = options;
    if (!etag1 || !etag2)
        return false;
    const parsed1 = parseETag(etag1);
    const parsed2 = parseETag(etag2);
    if (!parsed1 || !parsed2)
        return false;
    if (!weakComparison) {
        return parsed1.raw === parsed2.raw;
    }
    return parsed1.hash === parsed2.hash;
}
export function validateIfMatch(ifMatchHeader, currentETag) {
    if (!ifMatchHeader)
        return true;
    if (ifMatchHeader.trim() === '*') {
        return !!currentETag;
    }
    const requestedETags = ifMatchHeader
        .split(',')
        .map(e => e.trim());
    return requestedETags.some(reqETag => etagMatches(reqETag, currentETag));
}
export function validateIfNoneMatch(ifNoneMatchHeader, currentETag) {
    if (!ifNoneMatchHeader)
        return true;
    if (ifNoneMatchHeader.trim() === '*') {
        return !currentETag;
    }
    const requestedETags = ifNoneMatchHeader
        .split(',')
        .map(e => e.trim());
    return !requestedETags.some(reqETag => etagMatches(reqETag, currentETag));
}
export function generateRecordETag(record) {
    if (!record)
        return null;
    const lastModified = record._updatedAt || record._createdAt;
    return generateETag(record, {
        weak: true,
        lastModified: lastModified
    });
}
//# sourceMappingURL=etag.js.map