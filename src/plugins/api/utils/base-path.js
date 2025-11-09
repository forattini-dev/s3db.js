/**
 * Base path utilities for API plugin
 */

/**
 * Normalize base path to a canonical string.
 * Ensures leading slash, removes trailing slash, treats '/' as empty.
 * @param {string} [value]
 * @returns {string} normalized base path ('' means no base path)
 */
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

  // Remove trailing slashes (but keep root '/')
  normalized = normalized.replace(/\/+$/, '');

  return normalized || '';
}

/**
 * Prepend the normalized base path to a route path.
 * @param {string} basePath - Normalized base path ('' or '/segment')
 * @param {string} path - Route path starting with '/' (or special cases like '/*')
 * @returns {string} Combined path
 */
export function applyBasePath(basePath, path = '') {
  if (!basePath) {
    return path || '/';
  }

  if (!path || path === '/') {
    return basePath;
  }

  const hasSlash = path.startsWith('/');
  const nextPath = hasSlash ? path : `/${path}`;

  // Avoid duplicating base path if path already includes it
  if (nextPath.startsWith(basePath + '/')) {
    return nextPath;
  }

  return `${basePath}${nextPath}`;
}

export default {
  normalizeBasePath,
  applyBasePath
};
