import fs from 'fs/promises';
import { createLogger } from '../../../concerns/logger.js';
import type { Logger } from '../../../concerns/logger.js';
import path from 'path';
import { createReadStream } from 'fs';
import crypto from 'crypto';
import { getContentType } from './mime-types.js';
import type { Context, MiddlewareHandler } from 'hono';

const logger: Logger = createLogger({ name: 'StaticFilesystem', level: 'info' });

export interface FilesystemHandlerConfig {
  root: string;
  index?: string[];
  fallback?: string | boolean;
  maxAge?: number;
  dotfiles?: 'ignore' | 'allow' | 'deny';
  etag?: boolean;
  cors?: boolean;
}

interface ResponseHeaders {
  'Content-Type': string;
  'Content-Length': string;
  'Last-Modified': string;
  'ETag'?: string;
  'Cache-Control': string;
  'Access-Control-Allow-Origin'?: string;
  'Access-Control-Allow-Methods'?: string;
  'Content-Range'?: string;
  'Accept-Ranges'?: string;
  [key: string]: string | undefined;
}

export function createFilesystemHandler(config: FilesystemHandlerConfig): MiddlewareHandler {
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

  const absoluteRoot = path.resolve(root);

  let fallbackFile: string | null = null;
  if (fallback === true) {
    fallbackFile = index[0] ?? null;
  } else if (typeof fallback === 'string') {
    fallbackFile = fallback;
  }

  return async (c: Context): Promise<Response> => {
    try {
      let requestPath = c.req.path.replace(/^\//, '');

      const safePath = path.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(absoluteRoot, safePath);

      if (!fullPath.startsWith(absoluteRoot)) {
        return c.json({ success: false, error: { message: 'Forbidden' } }, 403);
      }

      let stats;
      let useFallback = false;
      try {
        stats = await fs.stat(fullPath);
      } catch (err) {
        const fsError = err as NodeJS.ErrnoException;
        if (fsError.code === 'ENOENT' && fallbackFile) {
          useFallback = true;
        } else if (fsError.code === 'ENOENT') {
          return c.json({ success: false, error: { message: 'Not Found' } }, 404);
        } else {
          throw err;
        }
      }

      let filePath = fullPath;
      if (useFallback) {
        filePath = path.join(absoluteRoot, fallbackFile!);
        try {
          stats = await fs.stat(filePath);
        } catch {
          return c.json({ success: false, error: { message: 'Not Found' } }, 404);
        }
      }

      if (!useFallback && stats!.isDirectory()) {
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
          } catch {
            // Continue to next index file
          }
        }

        if (!indexFound) {
          if (fallbackFile) {
            filePath = path.join(absoluteRoot, fallbackFile);
            try {
              stats = await fs.stat(filePath);
            } catch {
              return c.json({ success: false, error: { message: 'Forbidden' } }, 403);
            }
          } else {
            return c.json({ success: false, error: { message: 'Forbidden' } }, 403);
          }
        }
      }

      const filename = path.basename(filePath);
      if (filename.startsWith('.')) {
        if (dotfiles === 'deny') {
          return c.json({ success: false, error: { message: 'Forbidden' } }, 403);
        } else if (dotfiles === 'ignore') {
          return c.json({ success: false, error: { message: 'Not Found' } }, 404);
        }
      }

      const etagValue = etag
        ? `"${crypto.createHash('md5').update(`${stats!.mtime.getTime()}-${stats!.size}`).digest('hex')}"`
        : null;

      if (etagValue) {
        const ifNoneMatch = c.req.header('If-None-Match');
        if (ifNoneMatch === etagValue) {
          return c.body(null, 304, {
            'ETag': etagValue,
            'Cache-Control': maxAge > 0 ? `public, max-age=${Math.floor(maxAge / 1000)}` : 'no-cache'
          });
        }
      }

      const contentType = getContentType(filename);

      const headers: ResponseHeaders = {
        'Content-Type': contentType,
        'Content-Length': stats!.size.toString(),
        'Last-Modified': stats!.mtime.toUTCString(),
        'Cache-Control': maxAge > 0 ? `public, max-age=${Math.floor(maxAge / 1000)}` : 'no-cache'
      };

      if (etagValue) {
        headers['ETag'] = etagValue;
      }

      if (cors) {
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS';
      }

      const rangeHeader = c.req.header('Range');
      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0]!, 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats!.size - 1;

        if (start >= stats!.size || end >= stats!.size) {
          return c.body(null, 416, {
            'Content-Range': `bytes */${stats!.size}`
          });
        }

        const chunkSize = (end - start) + 1;
        const stream = createReadStream(filePath, { start, end });

        headers['Content-Range'] = `bytes ${start}-${end}/${stats!.size}`;
        headers['Content-Length'] = chunkSize.toString();
        headers['Accept-Ranges'] = 'bytes';

        return new Response(stream as unknown as BodyInit, { status: 206, headers: headers as HeadersInit });
      }

      if (c.req.method === 'HEAD') {
        return new Response(null, { status: 200, headers: headers as HeadersInit });
      }

      const stream = createReadStream(filePath);
      return new Response(stream as unknown as BodyInit, { status: 200, headers: headers as HeadersInit });

    } catch (err) {
      const logLevel = c?.get?.('logLevel');
      if (logLevel === 'debug' || logLevel === 'trace') {
        logger.error({ error: (err as Error).message }, '[Static Filesystem] Error');
      }
      return c.json({ success: false, error: { message: 'Internal Server Error' } }, 500);
    }
  };
}

export function validateFilesystemConfig(config: Partial<FilesystemHandlerConfig>): void {
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
