/**
 * S3 Static File Driver
 *
 * Serves static files from S3 bucket with:
 * - Streaming mode (proxy through server)
 * - Presigned URL mode (redirect to S3)
 * - ETag support (304 Not Modified)
 * - Range requests (partial content)
 * - Cache-Control headers
 */

import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getContentType } from './mime-types.js';

/**
 * Create S3 static file handler
 * @param {Object} config - Configuration
 * @param {Object} config.s3Client - AWS S3 Client instance
 * @param {string} config.bucket - S3 bucket name
 * @param {string} [config.prefix] - S3 key prefix (e.g., 'static/')
 * @param {boolean} [config.streaming] - Stream files through server (true) or redirect to presigned URL (false)
 * @param {number} [config.signedUrlExpiry] - Presigned URL expiry in seconds (default: 300)
 * @param {number} [config.maxAge] - Cache max-age in milliseconds
 * @param {string} [config.cacheControl] - Custom Cache-Control header
 * @param {string} [config.contentDisposition] - Content-Disposition header
 * @param {boolean} [config.etag] - Enable ETag support
 * @param {boolean} [config.cors] - Enable CORS headers
 * @returns {Function} Hono middleware
 */
export function createS3Handler(config = {}) {
  const {
    s3Client,
    bucket,
    prefix = '',
    streaming = true,
    signedUrlExpiry = 300,
    maxAge = 0,
    cacheControl,
    contentDisposition = 'inline',
    etag = true,
    cors = false
  } = config;

  if (!s3Client) {
    throw new Error('S3 static handler requires "s3Client"');
  }

  if (!bucket) {
    throw new Error('S3 static handler requires "bucket" name');
  }

  return async (c) => {
    try {
      // Get requested path (remove leading slash)
      let requestPath = c.req.path.replace(/^\//, '');

      // Build S3 key
      const key = prefix ? `${prefix}${requestPath}` : requestPath;

      // Security: Prevent path traversal in key
      if (key.includes('..') || key.includes('//')) {
        return c.json({ success: false, error: { message: 'Forbidden' } }, 403);
      }

      // Get object metadata (HEAD request)
      let metadata;
      try {
        const headCommand = new HeadObjectCommand({ Bucket: bucket, Key: key });
        metadata = await s3Client.send(headCommand);
      } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
          return c.json({ success: false, error: { message: 'Not Found' } }, 404);
        }
        throw err;
      }

      // Check ETag (If-None-Match)
      if (etag && metadata.ETag) {
        const ifNoneMatch = c.req.header('If-None-Match');
        if (ifNoneMatch === metadata.ETag) {
          const headers = {
            'ETag': metadata.ETag,
            'Cache-Control': cacheControl || (maxAge > 0 ? `public, max-age=${Math.floor(maxAge / 1000)}` : 'no-cache')
          };

          if (cors) {
            headers['Access-Control-Allow-Origin'] = '*';
            headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS';
          }

          return c.body(null, 304, headers);
        }
      }

      // MODE 1: Presigned URL (redirect)
      if (!streaming) {
        const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
        const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: signedUrlExpiry });

        return c.redirect(signedUrl, 302);
      }

      // MODE 2: Streaming (proxy through server)

      // Determine content type
      const contentType = metadata.ContentType || getContentType(key);

      // Build headers
      const headers = {
        'Content-Type': contentType,
        'Content-Length': metadata.ContentLength?.toString() || '0',
        'Last-Modified': metadata.LastModified?.toUTCString() || new Date().toUTCString()
      };

      if (metadata.ETag && etag) {
        headers['ETag'] = metadata.ETag;
      }

      if (cacheControl) {
        headers['Cache-Control'] = cacheControl;
      } else if (maxAge > 0) {
        headers['Cache-Control'] = `public, max-age=${Math.floor(maxAge / 1000)}`;
      } else {
        headers['Cache-Control'] = 'no-cache';
      }

      if (contentDisposition) {
        const filename = key.split('/').pop();
        headers['Content-Disposition'] = `${contentDisposition}; filename="${filename}"`;
      }

      if (cors) {
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS';
      }

      // Handle Range requests
      const rangeHeader = c.req.header('Range');
      let getCommand;

      if (rangeHeader) {
        // Parse range header
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : metadata.ContentLength - 1;

        if (start >= metadata.ContentLength || end >= metadata.ContentLength) {
          return c.body(null, 416, {
            'Content-Range': `bytes */${metadata.ContentLength}`
          });
        }

        const range = `bytes=${start}-${end}`;
        getCommand = new GetObjectCommand({ Bucket: bucket, Key: key, Range: range });

        const chunkSize = (end - start) + 1;
        headers['Content-Range'] = `bytes ${start}-${end}/${metadata.ContentLength}`;
        headers['Content-Length'] = chunkSize.toString();
        headers['Accept-Ranges'] = 'bytes';

        const response = await s3Client.send(getCommand);

        return c.body(response.Body, 206, headers);
      }

      // Handle HEAD requests
      if (c.req.method === 'HEAD') {
        return c.body(null, 200, headers);
      }

      // Stream full file
      getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
      const response = await s3Client.send(getCommand);

      return c.body(response.Body, 200, headers);

    } catch (err) {
      console.error('[Static S3] Error:', err);
      return c.json({ success: false, error: { message: 'Internal Server Error' } }, 500);
    }
  };
}

/**
 * Validate S3 config
 * @param {Object} config - S3 config
 * @throws {Error} If config is invalid
 */
export function validateS3Config(config) {
  if (!config.bucket || typeof config.bucket !== 'string') {
    throw new Error('S3 static config requires "bucket" name (string)');
  }

  if (config.prefix !== undefined && typeof config.prefix !== 'string') {
    throw new Error('S3 static "prefix" must be a string');
  }

  if (config.streaming !== undefined && typeof config.streaming !== 'boolean') {
    throw new Error('S3 static "streaming" must be a boolean');
  }

  if (config.signedUrlExpiry !== undefined && typeof config.signedUrlExpiry !== 'number') {
    throw new Error('S3 static "signedUrlExpiry" must be a number');
  }

  if (config.maxAge !== undefined && typeof config.maxAge !== 'number') {
    throw new Error('S3 static "maxAge" must be a number');
  }

  if (config.cacheControl !== undefined && typeof config.cacheControl !== 'string') {
    throw new Error('S3 static "cacheControl" must be a string');
  }

  if (config.contentDisposition !== undefined && typeof config.contentDisposition !== 'string') {
    throw new Error('S3 static "contentDisposition" must be a string');
  }

  if (config.etag !== undefined && typeof config.etag !== 'boolean') {
    throw new Error('S3 static "etag" must be a boolean');
  }

  if (config.cors !== undefined && typeof config.cors !== 'boolean') {
    throw new Error('S3 static "cors" must be a boolean');
  }
}

export default {
  createS3Handler,
  validateS3Config
};
