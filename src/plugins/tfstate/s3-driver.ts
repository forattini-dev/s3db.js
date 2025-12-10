/**
 * S3 Driver for TfState Plugin
 *
 * Reads Terraform/OpenTofu state files from S3 buckets
 */
import { TfStateDriver, type StateFileMetadata } from './base-driver.js';
import { S3Client } from '../../clients/s3-client.class.js';
import tryFn from '../../concerns/try-fn.js';
import { TfStateError, InvalidStateFileError, StateFileNotFoundError } from './errors.js';

export class S3TfStateDriver extends TfStateDriver {
  connectionConfig: {
    bucket: string;
    prefix: string;
    credentials?: { accessKeyId?: string; secretAccessKey?: string };
    region?: string;
  };
  client: S3Client | null;

  constructor(config: any = {}) {
    super(config);

    // Parse connection string if provided
    if (config.connectionString) {
      this.connectionConfig = this._parseConnectionString(config.connectionString);
    } else {
      this.connectionConfig = {
        bucket: config.bucket,
        prefix: config.prefix || '',
        credentials: config.credentials,
        region: config.region
      };
    }

    this.client = null;
  }

  /**
   * Parse S3 connection string
   * Format: s3://accessKey:secretKey@bucket/prefix
   */
  private _parseConnectionString(connectionString: string): any {
    try {
      const url = new URL(connectionString);

      if (url.protocol !== 's3:') {
        throw new TfStateError('Connection string must use s3:// protocol', {
          operation: 'parseConnectionString',
          statusCode: 400,
          retriable: false,
          suggestion: 'Use format s3://accessKey:secretKey@bucket/prefix?region=us-east-1',
          connectionString
        });
      }

      const credentials: any = {};
      if (url.username) {
        credentials.accessKeyId = decodeURIComponent(url.username);
      }
      if (url.password) {
        credentials.secretAccessKey = decodeURIComponent(url.password);
      }

      // Extract bucket and prefix from hostname and pathname
      const bucket = url.hostname;
      const prefix = url.pathname ? url.pathname.substring(1) : ''; // Remove leading '/'

      // Extract region from search params if provided
      const region = url.searchParams.get('region') || 'us-east-1';

      return {
        bucket,
        prefix,
        credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
        region
      };
    } catch (error: any) {
      throw new TfStateError('Invalid S3 connection string', {
        operation: 'parseConnectionString',
        statusCode: 400,
        retriable: false,
        suggestion: 'Ensure the connection string follows s3://accessKey:secretKey@bucket/prefix?region=REGION.',
        connectionString,
        original: error
      });
    }
  }

  /**
   * Initialize S3 client
   */
  override async initialize(): Promise<void> {
    const { bucket, credentials, region, prefix } = this.connectionConfig;

    // Build connection string for s3db's S3Client
    let connectionString = 's3://';
    if (credentials?.accessKeyId && credentials?.secretAccessKey) {
      connectionString += `${encodeURIComponent(credentials.accessKeyId)}:${encodeURIComponent(credentials.secretAccessKey)}@`;
    }
    connectionString += bucket;
    if (prefix) {
      connectionString += `/${prefix}`;
    }
    connectionString += `?region=${region || 'us-east-1'}`;

    // Create S3 client using s3db's S3Client class
    this.client = new S3Client({
      connectionString
    });
  }

  /**
   * List all state files in S3 matching the selector
   */
  override async listStateFiles(): Promise<StateFileMetadata[]> {
    const { prefix } = this.connectionConfig;

    const [ok, err, data] = await tryFn(async () => {
      return await this.client!.listObjects({
        prefix: prefix || ''
      });
    });

    if (!ok) {
      throw new TfStateError('Failed to list Terraform state objects from S3', {
        operation: 'listStateFiles',
        retriable: false,
        suggestion: 'Validate S3 permissions (s3:ListBucket) and prefix configuration.',
        prefix,
        original: err
      });
    }

    const objects = (data as any).Contents || [];

    // Filter by selector and .tfstate extension
    const stateFiles = objects
      .filter((obj: any) => {
        const relativePath = obj.Key.startsWith(prefix)
          ? obj.Key.substring(prefix.length)
          : obj.Key;

        return this.matchesSelector(relativePath) && relativePath.endsWith('.tfstate');
      })
      .map((obj: any) => ({
        path: obj.Key,
        lastModified: obj.LastModified,
        size: obj.Size,
        etag: obj.ETag
      }));

    return stateFiles;
  }

  /**
   * Read a state file from S3
   */
  override async readStateFile(path: string): Promise<any> {
    const [ok, err, data] = await tryFn(async () => {
      return await this.client!.getObject(path);
    });

    if (!ok) {
      if ((err as any)?.$metadata?.httpStatusCode === 404) {
        throw new StateFileNotFoundError(path, {
          operation: 'readStateFile',
          retriable: false,
          suggestion: 'Ensure the state file exists in S3 and the IAM role can access it.',
          original: err
        });
      }
      throw new TfStateError(`Failed to read state file ${path}`, {
        operation: 'readStateFile',
        retriable: false,
        suggestion: 'Verify S3 permissions (s3:GetObject) and network connectivity.',
        path,
        original: err
      });
    }

    try {
      const content = (data as any).Body.toString('utf-8');
      return JSON.parse(content);
    } catch (parseError: any) {
      throw new InvalidStateFileError(path, parseError.message, {
        operation: 'readStateFile',
        retriable: false,
        suggestion: 'Check if the state file contains valid JSON exported by Terraform.',
        original: parseError
      });
    }
  }

  /**
   * Get state file metadata from S3
   */
  override async getStateFileMetadata(path: string): Promise<StateFileMetadata> {
    const [ok, err, data] = await tryFn(async () => {
      return await this.client!.headObject(path);
    });

    if (!ok) {
      if ((err as any)?.$metadata?.httpStatusCode === 404) {
        throw new StateFileNotFoundError(path, {
          operation: 'getStateFileMetadata',
          retriable: false,
          suggestion: 'Ensure the state file exists in S3 and the IAM role can access it.',
          original: err
        });
      }
      throw new TfStateError(`Failed to get metadata for ${path}`, {
        operation: 'getStateFileMetadata',
        retriable: false,
        suggestion: 'Verify S3 permissions (s3:HeadObject) and bucket configuration.',
        path,
        original: err
      });
    }

    return {
      path,
      lastModified: (data as any).LastModified,
      size: (data as any).ContentLength,
      etag: (data as any).ETag
    };
  }

  /**
   * Check if state file has been modified
   */
  override async hasBeenModified(path: string, since: Date): Promise<boolean> {
    const metadata = await this.getStateFileMetadata(path);
    const lastModified = new Date(metadata.lastModified);
    const sinceDate = new Date(since);

    return lastModified > sinceDate;
  }

  /**
   * Close S3 client
   */
  override async close(): Promise<void> {
    // S3Client doesn't have a disconnect method in s3db.js
    // Just set to null
    this.client = null;
  }
}
