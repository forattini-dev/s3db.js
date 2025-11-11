/**
 * Filesystem Static File Driver
 *
 * Serves static files from local filesystem with:
 * - ETag support (304 Not Modified)
 * - Range requests (partial content)
 * - Directory index files
 * - Security (path traversal prevention)
 * - Cache-Control headers
 */

import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import crypto from 'crypto';
import { getContentType, isCompressible } from './mime-types.js';

/**
 * Create filesystem static file handler
 * @param {Object} config - Configuration
 * @param {string} config.root - Root directory to serve files from
 * @param {Array<string>} [config.index] - Index files (e.g., ['index.html'])
 * @param {string|boolean} [config.fallback] - Fallback file for SPA routing (e.g., 'index.html', true uses index[0], false disables)
 * @param {number} [config.maxAge] - Cache max-age in milliseconds
 * @param {string} [config.dotfiles] - How to handle dotfiles ('ignore', 'allow', 'deny')
 * @param {boolean} [config.etag] - Enable ETag generation
 * @param {boolean} [config.cors] - Enable CORS headers
 * @returns {Function} Hono middleware
 */
export function createFilesystemHandler(config = {}) {
  const {
    root,
    index = ['index.html'],
    fallback = false,
    maxAge = 0,
    dotfiles = 'ignore',
    etag = true,
    cors = false
  } = config;

  if (!root) {
    throw new Error('Filesystem static handler requires "root" directory');
  }

  // Resolve root to absolute path
  const absoluteRoot = path.resolve(root);

  // Determine fallback file
  let fallbackFile = null;
  if (fallback === true) {
    fallbackFile = index[0]; // Use first index file
  } else if (typeof fallback === 'string') {
    fallbackFile = fallback;
  }

  return async (c) => {
    try {
      // Get requested path (remove leading slash)
      let requestPath = c.req.path.replace(/^\//, '');

      // Security: Prevent path traversal
      const safePath = path.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(absoluteRoot, safePath);

      // Ensure path is within root directory
      if (!fullPath.startsWith(absoluteRoot)) {
        return c.json({ success: false, error: { message: 'Forbidden' } }, 403);
      }

      // Check if path exists
      let stats;
      let useFallback = false;
      try {
        stats = await fs.stat(fullPath);
      } catch (err) {
        if (err.code === 'ENOENT' && fallbackFile) {
          // File not found, try fallback
          useFallback = true;
        } else if (err.code === 'ENOENT') {
          return c.json({ success: false, error: { message: 'Not Found' } }, 404);
        } else {
          throw err;
        }
      }

      // Use fallback file if needed
      let filePath = fullPath;
      if (useFallback) {
        filePath = path.join(absoluteRoot, fallbackFile);
        try {
          stats = await fs.stat(filePath);
        } catch (err) {
          // Fallback file doesn't exist
          return c.json({ success: false, error: { message: 'Not Found' } }, 404);
        }
      }

      // Handle directories
      if (!useFallback && stats.isDirectory()) {
        // Try index files
        let indexFound = false;
        for (const indexFile of index) {
          const indexPath = path.join(fullPath, indexFile);
          try {
            const indexStats = await fs.stat(indexPath);
            if (indexStats.isFile()) {
              filePath = indexPath;
              stats = indexStats;
              indexFound = true;
              break;
            }
          } catch (err) {
            // Continue to next index file
          }
        }

        if (!indexFound) {
          // Directory with no index file, try fallback for SPA routing
          if (fallbackFile) {
            filePath = path.join(absoluteRoot, fallbackFile);
            try {
              stats = await fs.stat(filePath);
            } catch (err) {
              return c.json({ success: false, error: { message: 'Forbidden' } }, 403);
            }
          } else {
            return c.json({ success: false, error: { message: 'Forbidden' } }, 403);
          }
        }
      }

      // Handle dotfiles
      const filename = path.basename(filePath);
      if (filename.startsWith('.')) {
        if (dotfiles === 'deny') {
          return c.json({ success: false, error: { message: 'Forbidden' } }, 403);
        } else if (dotfiles === 'ignore') {
          return c.json({ success: false, error: { message: 'Not Found' } }, 404);
        }
        // 'allow' - continue
      }

      // Generate ETag (based on mtime + size)
      const etagValue = etag
        ? `"${crypto.createHash('md5').update(`${stats.mtime.getTime()}-${stats.size}`).digest('hex')}"`
        : null;

      // Check If-None-Match header (ETag)
      if (etagValue) {
        const ifNoneMatch = c.req.header('If-None-Match');
        if (ifNoneMatch === etagValue) {
          return c.body(null, 304, {
            'ETag': etagValue,
            'Cache-Control': maxAge > 0 ? `public, max-age=${Math.floor(maxAge / 1000)}` : 'no-cache'
          });
        }
      }

      // Get content type
      const contentType = getContentType(filename);

      // Build headers
      const headers = {
        'Content-Type': contentType,
        'Content-Length': stats.size.toString(),
        'Last-Modified': stats.mtime.toUTCString()
      };

      if (etagValue) {
        headers['ETag'] = etagValue;
      }

      if (maxAge > 0) {
        headers['Cache-Control'] = `public, max-age=${Math.floor(maxAge / 1000)}`;
      } else {
        headers['Cache-Control'] = 'no-cache';
      }

      if (cors) {
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS';
      }

      // Handle Range requests (partial content)
      const rangeHeader = c.req.header('Range');
      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

        if (start >= stats.size || end >= stats.size) {
          return c.body(null, 416, {
            'Content-Range': `bytes */${stats.size}`
          });
        }

        const chunkSize = (end - start) + 1;
        const stream = createReadStream(filePath, { start, end });

        headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
        headers['Content-Length'] = chunkSize.toString();
        headers['Accept-Ranges'] = 'bytes';

        return c.body(stream, 206, headers);
      }

      // Handle HEAD requests
      if (c.req.method === 'HEAD') {
        return c.body(null, 200, headers);
      }

      // Stream file
      const stream = createReadStream(filePath);

      return c.body(stream, 200, headers);

    } catch (err) {
      if (c && c.get && c.get('verbose')) {
        console.error('[Static Filesystem] Error:', err);
      }
      return c.json({ success: false, error: { message: 'Internal Server Error' } }, 500);
    }
  };
}

/**
 * Validate filesystem config
 * @param {Object} config - Filesystem config
 * @throws {Error} If config is invalid
 */
export function validateFilesystemConfig(config) {
  if (!config.root || typeof config.root !== 'string') {
    throw new Error('Filesystem static config requires "root" directory (string)');
  }

  if (config.index !== undefined && !Array.isArray(config.index)) {
    throw new Error('Filesystem static "index" must be an array');
  }

  if (config.fallback !== undefined && typeof config.fallback !== 'string' && typeof config.fallback !== 'boolean') {
    throw new Error('Filesystem static "fallback" must be a string (filename) or boolean');
  }

  if (config.maxAge !== undefined && typeof config.maxAge !== 'number') {
    throw new Error('Filesystem static "maxAge" must be a number');
  }

  if (config.dotfiles !== undefined && !['ignore', 'allow', 'deny'].includes(config.dotfiles)) {
    throw new Error('Filesystem static "dotfiles" must be "ignore", "allow", or "deny"');
  }

  if (config.etag !== undefined && typeof config.etag !== 'boolean') {
    throw new Error('Filesystem static "etag" must be a boolean');
  }

  if (config.cors !== undefined && typeof config.cors !== 'boolean') {
    throw new Error('Filesystem static "cors" must be a boolean');
  }
}

export default {
  createFilesystemHandler,
  validateFilesystemConfig
};
