/**
 * MIME Type Detection
 *
 * Lightweight MIME type detection based on file extensions
 */

/**
 * Common MIME types mapped by extension
 */
const MIME_TYPES = {
  // Text
  'txt': 'text/plain',
  'html': 'text/html',
  'htm': 'text/html',
  'css': 'text/css',
  'js': 'text/javascript',
  'mjs': 'text/javascript',
  'json': 'application/json',
  'xml': 'application/xml',
  'csv': 'text/csv',
  'md': 'text/markdown',

  // Images
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'ico': 'image/x-icon',
  'bmp': 'image/bmp',
  'tiff': 'image/tiff',
  'tif': 'image/tiff',

  // Audio
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'flac': 'audio/flac',
  'm4a': 'audio/mp4',

  // Video
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'ogv': 'video/ogg',
  'avi': 'video/x-msvideo',
  'mov': 'video/quicktime',
  'mkv': 'video/x-matroska',

  // Documents
  'pdf': 'application/pdf',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ppt': 'application/vnd.ms-powerpoint',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // Archives
  'zip': 'application/zip',
  'tar': 'application/x-tar',
  'gz': 'application/gzip',
  'bz2': 'application/x-bzip2',
  '7z': 'application/x-7z-compressed',
  'rar': 'application/vnd.rar',

  // Fonts
  'ttf': 'font/ttf',
  'otf': 'font/otf',
  'woff': 'font/woff',
  'woff2': 'font/woff2',
  'eot': 'application/vnd.ms-fontobject',

  // Application
  'wasm': 'application/wasm',
  'bin': 'application/octet-stream'
};

/**
 * Get MIME type from filename
 * @param {string} filename - Filename with extension
 * @returns {string} MIME type (defaults to 'application/octet-stream')
 * @example
 * getMimeType('image.png') // 'image/png'
 * getMimeType('document.pdf') // 'application/pdf'
 * getMimeType('unknown.xyz') // 'application/octet-stream'
 */
export function getMimeType(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'application/octet-stream';
  }

  // Extract extension (lowercase)
  const ext = filename.split('.').pop().toLowerCase();

  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Check if MIME type is compressible
 * @param {string} mimeType - MIME type
 * @returns {boolean} True if compressible
 */
export function isCompressible(mimeType) {
  if (!mimeType) return false;

  // Text-based content is compressible
  if (mimeType.startsWith('text/')) return true;
  if (mimeType.includes('javascript')) return true;
  if (mimeType.includes('json')) return true;
  if (mimeType.includes('xml')) return true;
  if (mimeType.includes('svg')) return true;

  return false;
}

/**
 * Get charset for MIME type
 * @param {string} mimeType - MIME type
 * @returns {string|null} Charset or null
 */
export function getCharset(mimeType) {
  if (!mimeType) return null;

  // Text types should have UTF-8 charset
  if (mimeType.startsWith('text/')) return 'utf-8';
  if (mimeType.includes('javascript')) return 'utf-8';
  if (mimeType.includes('json')) return 'utf-8';
  if (mimeType.includes('xml')) return 'utf-8';

  return null;
}

/**
 * Build complete Content-Type header
 * @param {string} filename - Filename
 * @returns {string} Complete Content-Type header
 * @example
 * getContentType('file.html') // 'text/html; charset=utf-8'
 * getContentType('image.png') // 'image/png'
 */
export function getContentType(filename) {
  const mimeType = getMimeType(filename);
  const charset = getCharset(mimeType);

  return charset ? `${mimeType}; charset=${charset}` : mimeType;
}

export default {
  getMimeType,
  isCompressible,
  getCharset,
  getContentType
};
