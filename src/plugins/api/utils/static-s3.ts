import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client, HeadObjectCommandOutput, GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { createLogger } from '../../../concerns/logger.js';
import type { Logger } from '../../../concerns/logger.js';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getContentType } from './mime-types.js';
import type { Context, MiddlewareHandler } from 'hono';

const logger: Logger = createLogger({ name: 'StaticS3', level: 'info' });

export interface S3HandlerConfig {
  s3Client: S3Client;
  bucket: string;
  prefix?: string;
  streaming?: boolean;
  signedUrlExpiry?: number;
  maxAge?: number;
  cacheControl?: string;
  contentDisposition?: string;
  etag?: boolean;
  cors?: boolean;
}

interface ResponseHeaders {
  'Content-Type': string;
  'Content-Length': string;
  'Last-Modified': string;
  'ETag'?: string;
  'Cache-Control': string;
  'Content-Disposition'?: string;
  'Access-Control-Allow-Origin'?: string;
  'Access-Control-Allow-Methods'?: string;
  'Content-Range'?: string;
  'Accept-Ranges'?: string;
  [key: string]: string | undefined;
}

interface S3Error extends Error {
  name: string;
  $metadata?: {
    httpStatusCode?: number;
  };
}

export function createS3Handler(config: S3HandlerConfig): MiddlewareHandler {
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

  return async (c: Context): Promise<Response> => {
    try {
      let requestPath = c.req.path.replace(/^\//, '');
      const key = prefix ? `${prefix}${requestPath}` : requestPath;

      if (key.includes('..') || key.includes('//')) {
        return c.json({ success: false, error: { message: 'Forbidden' } }, 403);
      }

      let metadata: HeadObjectCommandOutput;
      try {
        const headCommand = new HeadObjectCommand({ Bucket: bucket, Key: key });
        metadata = await s3Client.send(headCommand);
      } catch (err) {
        const s3Err = err as S3Error;
        if (s3Err.name === 'NotFound' || s3Err.$metadata?.httpStatusCode === 404) {
          return c.json({ success: false, error: { message: 'Not Found' } }, 404);
        }
        throw err;
      }

      if (etag && metadata.ETag) {
        const ifNoneMatch = c.req.header('If-None-Match');
        if (ifNoneMatch === metadata.ETag) {
          const headers: Record<string, string> = {
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

      if (!streaming) {
        const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
        const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: signedUrlExpiry });
        return c.redirect(signedUrl, 302);
      }

      const contentType = metadata.ContentType || getContentType(key);

      const headers: ResponseHeaders = {
        'Content-Type': contentType,
        'Content-Length': metadata.ContentLength?.toString() || '0',
        'Last-Modified': metadata.LastModified?.toUTCString() || new Date().toUTCString(),
        'Cache-Control': cacheControl || (maxAge > 0 ? `public, max-age=${Math.floor(maxAge / 1000)}` : 'no-cache')
      };

      if (metadata.ETag && etag) {
        headers['ETag'] = metadata.ETag;
      }

      if (contentDisposition) {
        const filename = key.split('/').pop();
        headers['Content-Disposition'] = `${contentDisposition}; filename="${filename}"`;
      }

      if (cors) {
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS';
      }

      const rangeHeader = c.req.header('Range');
      let getCommand: GetObjectCommand;

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0]!, 10);
        const end = parts[1] ? parseInt(parts[1], 10) : metadata.ContentLength! - 1;

        if (start >= metadata.ContentLength! || end >= metadata.ContentLength!) {
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
        return new Response(response.Body as unknown as BodyInit, { status: 206, headers: headers as HeadersInit });
      }

      if (c.req.method === 'HEAD') {
        return new Response(null, { status: 200, headers: headers as HeadersInit });
      }

      getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
      const response: GetObjectCommandOutput = await s3Client.send(getCommand);

      return new Response(response.Body as unknown as BodyInit, { status: 200, headers: headers as HeadersInit });

    } catch (err) {
      logger.error({ error: (err as Error).message }, '[Static S3] Error');
      return c.json({ success: false, error: { message: 'Internal Server Error' } }, 500);
    }
  };
}

export function validateS3Config(config: Partial<S3HandlerConfig>): void {
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
