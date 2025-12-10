export function normalizeBasePath(value) {
    if (!value && value !== 0) {
        return '';
    }
    let normalized = String(value).trim();
    if (!normalized || normalized === '/') {
        return '';
    }
    if (!normalized.startsWith('/')) {
        normalized = `/${normalized}`;
    }
    normalized = normalized.replace(/\/+$/, '');
    return normalized || '';
}
export function applyBasePath(basePath, path = '') {
    if (!basePath) {
        return path || '/';
    }
    if (!path || path === '/') {
        return basePath;
    }
    const hasSlash = path.startsWith('/');
    const nextPath = hasSlash ? path : `/${path}`;
    if (nextPath.startsWith(basePath + '/')) {
        return nextPath;
    }
    return `${basePath}${nextPath}`;
}
export default {
    normalizeBasePath,
    applyBasePath
};
//# sourceMappingURL=base-path.js.map