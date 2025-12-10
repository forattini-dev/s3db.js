import path from 'path';
import { tryFnSync } from './concerns/try-fn.js';
import { ConnectionStringError } from './errors.js';

export const S3_DEFAULT_REGION = 'us-east-1';
export const S3_DEFAULT_ENDPOINT = 'https://s3.us-east-1.amazonaws.com';

export type ClientType = 'filesystem' | 'memory' | 's3' | 'custom';

export interface ClientOptions {
  [key: string]: unknown;
}

type CoercedValue = boolean | number | string;

export class ConnectionString {
  region: string;
  bucket: string;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  endpoint: string;
  keyPrefix: string;
  forcePathStyle?: boolean;
  clientType?: ClientType;
  basePath?: string;
  clientOptions: ClientOptions;

  constructor(connectionString: string) {
    const [ok, err, parsed] = tryFnSync(() => new URL(connectionString));
    if (!ok) {
      throw new ConnectionStringError('Invalid connection string: ' + connectionString, {
        original: err,
        input: connectionString
      });
    }
    const uri = parsed;

    // defaults:
    this.region = S3_DEFAULT_REGION;
    this.bucket = 's3db';
    this.accessKeyId = undefined;
    this.secretAccessKey = undefined;
    this.endpoint = S3_DEFAULT_ENDPOINT;
    this.keyPrefix = '';

    // config:
    if (uri.protocol === 's3:') this.defineFromS3(uri);
    else if (uri.protocol === 'file:') this.defineFromFileUri(uri);
    else if (uri.protocol === 'memory:') this.defineFromMemoryUri(uri);
    else this.defineFromCustomUri(uri);

    // Parse querystring parameters (supports nested dot notation)
    this.clientOptions = this._parseQueryParams(uri.searchParams);
  }

  private _parseQueryParams(searchParams: URLSearchParams): ClientOptions {
    const result: ClientOptions = {};

    for (const [key, value] of searchParams.entries()) {
      const keys = key.split('.');
      let current: Record<string, unknown> = result;

      // Navigate/create nested structure
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i]!;
        if (!current[k] || typeof current[k] !== 'object') {
          current[k] = {};
        }
        current = current[k] as Record<string, unknown>;
      }

      // Set final value with type coercion
      const finalKey = keys[keys.length - 1]!;
      current[finalKey] = this._coerceValue(value);
    }

    return result;
  }

  private _coerceValue(value: string): CoercedValue {
    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Number
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

    // String (default)
    return value;
  }

  private defineFromS3(uri: URL): void {
    const [okBucket, errBucket, bucket] = tryFnSync(() => decodeURIComponent(uri.hostname));
    if (!okBucket) {
      throw new ConnectionStringError('Invalid bucket in connection string', {
        original: errBucket,
        input: uri.hostname
      });
    }
    this.bucket = bucket || 's3db';

    const [okUser, errUser, user] = tryFnSync(() => decodeURIComponent(uri.username));
    if (!okUser) {
      throw new ConnectionStringError('Invalid accessKeyId in connection string', {
        original: errUser,
        input: uri.username
      });
    }
    this.accessKeyId = user;

    const [okPass, errPass, pass] = tryFnSync(() => decodeURIComponent(uri.password));
    if (!okPass) {
      throw new ConnectionStringError('Invalid secretAccessKey in connection string', {
        original: errPass,
        input: uri.password
      });
    }
    this.secretAccessKey = pass;
    this.endpoint = S3_DEFAULT_ENDPOINT;

    if (["/", "", null].includes(uri.pathname)) {
      this.keyPrefix = '';
    } else {
      const [, ...subpath] = uri.pathname.split('/');
      this.keyPrefix = [...(subpath || [])].join('/');
    }
  }

  private defineFromCustomUri(uri: URL): void {
    this.forcePathStyle = true;
    this.endpoint = uri.origin;

    const [okUser, errUser, user] = tryFnSync(() => decodeURIComponent(uri.username));
    if (!okUser) {
      throw new ConnectionStringError('Invalid accessKeyId in connection string', {
        original: errUser,
        input: uri.username
      });
    }
    this.accessKeyId = user;

    const [okPass, errPass, pass] = tryFnSync(() => decodeURIComponent(uri.password));
    if (!okPass) {
      throw new ConnectionStringError('Invalid secretAccessKey in connection string', {
        original: errPass,
        input: uri.password
      });
    }
    this.secretAccessKey = pass;

    if (["/", "", null].includes(uri.pathname)) {
      this.bucket = 's3db';
      this.keyPrefix = '';
    } else {
      const [, bucket, ...subpath] = uri.pathname.split('/');
      if (!bucket) {
        this.bucket = 's3db';
      } else {
        const [okBucket, errBucket, bucketDecoded] = tryFnSync(() => decodeURIComponent(bucket));
        if (!okBucket) {
          throw new ConnectionStringError('Invalid bucket in connection string', {
            original: errBucket,
            input: bucket
          });
        }
        this.bucket = bucketDecoded;
      }
      this.keyPrefix = [...(subpath || [])].join('/');
    }
  }

  private defineFromFileUri(uri: URL): void {
    this.clientType = 'filesystem';
    this.forcePathStyle = true;

    // No credentials needed for filesystem
    this.accessKeyId = undefined;
    this.secretAccessKey = undefined;

    // Parse pathname
    let pathname = uri.pathname || '';

    // Handle Windows paths (file:///C:/path/to/data)
    if (uri.hostname && uri.hostname.match(/^[a-zA-Z]$/)) {
      // Windows drive letter in hostname (file://C:/path)
      pathname = `${uri.hostname}:${pathname}`;
    } else if (uri.hostname && uri.hostname !== 'localhost') {
      // UNC path (file://server/share/path)
      pathname = `//${uri.hostname}${pathname}`;
    }

    // Decode URL-encoded characters
    const [okPath, errPath, decodedPath] = tryFnSync(() => decodeURIComponent(pathname));
    if (!okPath) {
      throw new ConnectionStringError('Invalid path in file:// connection string', {
        original: errPath,
        input: pathname
      });
    }

    // Handle empty path
    if (!decodedPath || decodedPath === '/' || decodedPath === '') {
      throw new ConnectionStringError('file:// connection string requires a path', {
        input: uri.href,
        suggestion: 'Use file:///absolute/path or file://./relative/path'
      });
    }

    // Parse path segments: /basePath/bucket/keyPrefix
    const segments = decodedPath.split('/').filter(Boolean);

    if (segments.length === 0) {
      throw new ConnectionStringError('file:// connection string requires a path', {
        input: uri.href,
        suggestion: 'Use file:///absolute/path or file://./relative/path'
      });
    }

    // For relative paths starting with ./ or ../
    if (decodedPath.startsWith('./') || decodedPath.startsWith('../')) {
      this.basePath = path.resolve(decodedPath);
      this.bucket = 's3db';
      this.keyPrefix = '';
    } else if (segments.length === 1) {
      this.basePath = path.resolve('/', segments[0]!);
      this.bucket = 's3db';
      this.keyPrefix = '';
    } else if (segments.length === 2) {
      const [baseSegment, bucketSegment] = segments;
      this.basePath = path.resolve('/', baseSegment!);
      this.bucket = bucketSegment!;
      this.keyPrefix = '';
    } else {
      const [baseSegment, bucketSegment, ...prefixSegments] = segments;
      this.basePath = path.resolve('/', baseSegment!);
      this.bucket = bucketSegment!;
      this.keyPrefix = prefixSegments.join('/');
    }

    // Set synthetic endpoint for compatibility
    this.endpoint = `file://${this.basePath}`;
    this.region = 'local';
  }

  private defineFromMemoryUri(uri: URL): void {
    this.clientType = 'memory';
    this.forcePathStyle = true;

    // No credentials needed for memory storage
    this.accessKeyId = undefined;
    this.secretAccessKey = undefined;

    // Parse hostname as bucket (or default to 's3db')
    const bucketFromHost = uri.hostname || '';
    if (bucketFromHost) {
      const [okBucket, , decodedBucket] = tryFnSync(() => decodeURIComponent(bucketFromHost));
      this.bucket = okBucket ? decodedBucket : bucketFromHost;
    } else {
      this.bucket = 's3db';
    }

    // Parse pathname as keyPrefix
    if (["/", "", null].includes(uri.pathname)) {
      this.keyPrefix = '';
    } else {
      const [, ...subpath] = uri.pathname.split('/');
      const decodedSegments = (subpath || []).map(segment => {
        if (!segment) {
          return segment;
        }
        const [okSegment, , decodedSegment] = tryFnSync(() => decodeURIComponent(segment));
        return okSegment ? decodedSegment : segment;
      });
      this.keyPrefix = decodedSegments.filter(Boolean).join('/');
    }

    // Set synthetic endpoint for compatibility
    this.endpoint = 'memory://localhost';
    this.region = 'us-east-1';
  }
}

export default ConnectionString;
