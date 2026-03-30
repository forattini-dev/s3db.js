import path from 'path';
import { tryFnSync } from './concerns/try-fn.js';
import { ConnectionStringError } from './errors.js';

export const S3_DEFAULT_REGION = 'us-east-1';
export const S3_DEFAULT_ENDPOINT = 'https://s3.us-east-1.amazonaws.com';

export type ClientType = 'filesystem' | 'memory' | 's3' | 'sqlite' | 'sqlite-remote' | 'custom';

export interface ClientOptions {
  [key: string]: unknown;
}

type CoercedValue = boolean | number | string;

export class ConnectionString {
  region: string;
  bucket: string;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  sessionToken: string | undefined;
  endpoint: string;
  keyPrefix: string;
  forcePathStyle?: boolean;
  clientType?: ClientType;
  basePath?: string;
  sqliteDriver?: 'libsql' | 'd1';
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
    this.sessionToken = undefined;
    this.endpoint = S3_DEFAULT_ENDPOINT;
    this.keyPrefix = '';

    // config:
    if (uri.protocol === 's3:') this.defineFromS3(uri);
    else if (uri.protocol === 'file:') this.defineFromFileUri(uri);
    else if (uri.protocol === 'memory:') this.defineFromMemoryUri(uri);
    else if (uri.protocol === 'sqlite:') this.defineFromSqliteUri(uri);
    else if (uri.protocol === 'sqlite+libsql:') this.defineFromRemoteSqliteUri(uri, 'libsql');
    else if (uri.protocol === 'sqlite+d1:') this.defineFromRemoteSqliteUri(uri, 'd1');
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
    this.sessionToken = uri.searchParams.get('sessionToken') || undefined;

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
    this.sessionToken = uri.searchParams.get('sessionToken') || undefined;

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
    let isRelativePath = false;

    // Handle Windows paths (file:///C:/path/to/data)
    if (uri.hostname && uri.hostname.match(/^[a-zA-Z]$/)) {
      // Windows drive letter in hostname (file://C:/path)
      pathname = `${uri.hostname}:${pathname}`;
    } else if (uri.hostname === '.' || uri.hostname === '..') {
      // Relative path: file://./path or file://../path
      // URL parser puts . or .. in hostname, reconstruct the relative path
      pathname = `${uri.hostname}${pathname}`;
      isRelativePath = true;
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

    // For relative paths (detected from hostname or starting with ./ or ../)
    if (isRelativePath || decodedPath.startsWith('./') || decodedPath.startsWith('../')) {
      this.basePath = path.resolve(decodedPath);
      this.bucket = 's3db';
      this.keyPrefix = '';
    } else {
      // Absolute path: use the entire path as basePath
      // This is the intuitive behavior - file:///path/to/data means "use /path/to/data"
      this.basePath = path.resolve(decodedPath);
      this.bucket = 's3db';
      this.keyPrefix = '';
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

  private defineFromSqliteUri(uri: URL): void {
    this.clientType = 'sqlite';
    this.forcePathStyle = true;

    // No credentials needed for sqlite
    this.accessKeyId = undefined;
    this.secretAccessKey = undefined;

    let pathname = uri.pathname || '';
    let isRelativePath = false;

    if (uri.hostname && uri.hostname.match(/^[a-zA-Z]$/)) {
      pathname = `${uri.hostname}:${pathname}`;
    } else if (uri.hostname === '.' || uri.hostname === '..') {
      pathname = `${uri.hostname}${pathname}`;
      isRelativePath = true;
    } else if (uri.hostname === 'localhost') {
      pathname = `${pathname}`;
    }

    const [okPath, errPath, decodedPath] = tryFnSync(() => decodeURIComponent(pathname));
    if (!okPath) {
      throw new ConnectionStringError('Invalid path in sqlite:// connection string', {
        original: errPath,
        input: pathname
      });
    }

    if (!decodedPath || decodedPath === '/' || decodedPath === '') {
      throw new ConnectionStringError('sqlite:// connection string requires a path', {
        input: uri.href,
        suggestion: 'Use sqlite:///absolute/path/filename.db'
      });
    }

    if (decodedPath === '/:memory:' || decodedPath === ':memory:') {
      this.basePath = ':memory:';
      this.bucket = 's3db';
      this.keyPrefix = '';
      this.region = 'sqlite';
      this.endpoint = 'sqlite:///:memory:';
      return;
    }

    if (isRelativePath || decodedPath.startsWith('./') || decodedPath.startsWith('../')) {
      this.basePath = path.resolve(decodedPath);
    } else {
      this.basePath = path.resolve(decodedPath);
    }

    this.bucket = 's3db';
    this.keyPrefix = '';
    this.region = 'sqlite';
    this.endpoint = `sqlite:///${encodeURI(this.basePath).replace(/^\//, '')}`;
  }

  private defineFromRemoteSqliteUri(uri: URL, driver: 'libsql' | 'd1'): void {
    this.clientType = 'sqlite-remote';
    this.sqliteDriver = driver;
    this.forcePathStyle = true;
    this.accessKeyId = undefined;
    this.secretAccessKey = undefined;
    this.bucket = 's3db';
    this.keyPrefix = '';
    this.region = 'sqlite';
    this.endpoint = `${uri.protocol}//${uri.host}${uri.pathname || ''}`;

    if (driver === 'd1') {
      const pathname = uri.pathname.replace(/^\/+/, '');
      const segments = pathname ? pathname.split('/').filter(Boolean) : [];

      if (uri.hostname === 'binding') {
        const bindingName = segments[0];
        if (!bindingName) {
          throw new ConnectionStringError('sqlite+d1://binding requires a binding name', {
            input: uri.href,
            suggestion: 'Use sqlite+d1://binding/DB or sqlite+d1://<accountId>/<databaseId>.'
          });
        }
        return;
      }

      const accountId = uri.hostname || '';
      const databaseId = segments[0] || '';
      if (!accountId || !databaseId) {
        throw new ConnectionStringError('sqlite+d1:// connection string requires accountId and databaseId', {
          input: uri.href,
          suggestion: 'Use sqlite+d1://<accountId>/<databaseId>?apiToken=...'
        });
      }
    }
  }
}

export default ConnectionString;
