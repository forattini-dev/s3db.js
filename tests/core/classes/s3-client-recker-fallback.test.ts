import { vi } from 'vitest';

const TEST_GLOBALS = {
  capturedOptions: '__s3db_recker_test_captured_options__',
  reckerShouldFail: '__s3db_recker_test_should_fail__',
};

const GLOBALS = globalThis as Record<string, any>;
GLOBALS[TEST_GLOBALS.capturedOptions] = null;
GLOBALS[TEST_GLOBALS.reckerShouldFail] = false;

const fakeReckerMetadata = { handlerProtocol: 'http/2' };

vi.mock('#src/clients/recker-http-handler.js', () => ({
  ReckerHttpHandler: class {
    metadata = fakeReckerMetadata;

    constructor() {
      if (GLOBALS[TEST_GLOBALS.reckerShouldFail]) {
        throw new Error('Recker unavailable');
      }
    }

    destroyAsync() {
      return Promise.resolve();
    }
  },
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    middlewareStack = { add: vi.fn() };

    constructor(options: Record<string, unknown>) {
      GLOBALS[TEST_GLOBALS.capturedOptions] = options;
    }

    send() {
      return Promise.resolve({});
    }

    destroy() {}
  },
  PutObjectCommand: class {},
  GetObjectCommand: class {},
  CopyObjectCommand: class {},
  HeadObjectCommand: class {},
  DeleteObjectCommand: class {},
  DeleteObjectsCommand: class {},
  ListObjectsV2Command: class {},
}));

import { S3Client } from '#src/clients/s3-client.class.js';

describe('S3Client Recker fallback', () => {
  beforeEach(() => {
    GLOBALS[TEST_GLOBALS.capturedOptions] = null;
    GLOBALS[TEST_GLOBALS.reckerShouldFail] = false;
  });

  const getCapturedOptions = () =>
    GLOBALS[TEST_GLOBALS.capturedOptions] as Record<string, unknown> | null;

  test('should forward sessionToken from connection string to AwsS3Client credentials', () => {
    new S3Client({
      connectionString: 's3://access:secret@bucket/prefix?sessionToken=TEMP%2BTOKEN',
    });

    expect((getCapturedOptions() as Record<string, any>).credentials).toEqual({
      accessKeyId: 'access',
      secretAccessKey: 'secret',
      sessionToken: 'TEMP+TOKEN',
    });
  });

  test('should fallback to AWS SDK request handler when Recker init fails', () => {
    GLOBALS[TEST_GLOBALS.reckerShouldFail] = true;

    new S3Client({
      connectionString: 's3://access:secret@bucket',
      httpClientOptions: {
        useReckerHandler: true,
      },
    });

    expect((getCapturedOptions() as Record<string, unknown>).requestHandler).toBeUndefined();
    expect((getCapturedOptions() as Record<string, unknown>).region).toBe('us-east-1');
  });

  test('should throw when failFastOnReckerFailure is true', () => {
    GLOBALS[TEST_GLOBALS.reckerShouldFail] = true;

    expect(() =>
      new S3Client({
        connectionString: 's3://access:secret@bucket',
        httpClientOptions: {
          useReckerHandler: true,
          failFastOnReckerFailure: true,
        },
      }),
    ).toThrow('Recker unavailable');
  });

  test('should use Recker handler when available', () => {
    new S3Client({
      connectionString: 's3://access:secret@bucket',
      httpClientOptions: {
        useReckerHandler: true,
      },
    });

    expect((getCapturedOptions() as Record<string, unknown>).requestHandler).toBeDefined();
    expect(
      ((getCapturedOptions() as Record<string, unknown>).requestHandler as { metadata: { handlerProtocol: string } }).metadata,
    ).toEqual(fakeReckerMetadata);
  });
});

