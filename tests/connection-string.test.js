import { 
  ConnectionString, 
  S3_DEFAULT_ENDPOINT,
} from '../src/connection-string.class';

const cases = {
  s3: 's3://accessKey:secretKey@my-bucket',
  s3WithPath: 's3://accessKey:secretKey@my-bucket/path/to/folder',
  s3WithParams: 's3://my-bucket?A=1&B=2',
  s3WithCredentials: 's3://accessKey:accessSecret@my-bucket',
  s3Complete: 's3://user:password@my-bucket/path/to/folder?A=1&B=2',

  minio: 'http://localhost:9000',
  minioWithBucket: 'http://localhost:9000/my-bucket',
  minioWithBucketAndPath: 'http://localhost:9000/my-bucket/path/to/folder',
  miniowithCredentials: 'http://user:password@localhost:9000/my-bucket',
  minioComplete: 'http://user:password@localhost:9000/my-bucket/path/to/folder?A=1&B=2',
}

describe('ConnectionString', () => {
  test('s3 basic setup', () => {
    const connection = new ConnectionString(cases.s3);
    expect(connection.endpoint).toBe(S3_DEFAULT_ENDPOINT);
    expect(connection.bucket).toBe('my-bucket');
    expect(connection.keyPrefix).toBe('');
    expect(connection.accessKeyId).toBe('accessKey');
    expect(connection.secretAccessKey).toBe('secretKey');
  })

  test('s3 with path', () => {
    const connection = new ConnectionString(cases.s3WithPath);
    expect(connection.endpoint).toBe(S3_DEFAULT_ENDPOINT);
    expect(connection.bucket).toBe('my-bucket');
    expect(connection.keyPrefix).toBe('path/to/folder');
    expect(connection.accessKeyId).toBe('accessKey');
    expect(connection.secretAccessKey).toBe('secretKey');
  })

  test('s3 with params', () => {
    const connection = new ConnectionString(cases.s3WithParams);
    expect(connection.endpoint).toBe(S3_DEFAULT_ENDPOINT);
    expect(connection.bucket).toBe('my-bucket');
    expect(connection.keyPrefix).toBe('');
    expect(connection.A).toBe('1');
    expect(connection.B).toBe('2');
  })

  test('s3 with credentials', () => {
    const connection = new ConnectionString(cases.s3WithCredentials);
    expect(connection.endpoint).toBe(S3_DEFAULT_ENDPOINT);
    expect(connection.bucket).toBe('my-bucket');
    expect(connection.keyPrefix).toBe('');
    expect(connection.accessKeyId).toBe('accessKey');
    expect(connection.secretAccessKey).toBe('accessSecret');
  })

  test('s3 complete setup', () => {
    const connection = new ConnectionString(cases.s3Complete);
    expect(connection.endpoint).toBe(S3_DEFAULT_ENDPOINT);
    expect(connection.bucket).toBe('my-bucket');
    expect(connection.keyPrefix).toBe('path/to/folder');
    expect(connection.accessKeyId).toBe('user');
    expect(connection.secretAccessKey).toBe('password');
    expect(connection.A).toBe('1');
    expect(connection.B).toBe('2');
  })

  test('minio basic setup', () => {
    const connection = new ConnectionString(cases.minio);
    expect(connection.endpoint).toBe('http://localhost:9000');
    expect(connection.bucket).toBe('s3db');
    expect(connection.keyPrefix).toBe('');
  })

  test('minio with bucket', () => {
    const connection = new ConnectionString(cases.minioWithBucket);
    expect(connection.endpoint).toBe('http://localhost:9000');
    expect(connection.bucket).toBe('my-bucket');
    expect(connection.keyPrefix).toBe('');
  })

  test('minio with bucket and path', () => {
    const connection = new ConnectionString(cases.minioWithBucketAndPath);
    expect(connection.endpoint).toBe('http://localhost:9000');
    expect(connection.bucket).toBe('my-bucket');
    expect(connection.keyPrefix).toBe('path/to/folder');
  })

  test('minio with credentials', () => {
    const connection = new ConnectionString(cases.miniowithCredentials);
    expect(connection.endpoint).toBe('http://localhost:9000');
    expect(connection.bucket).toBe('my-bucket');
    expect(connection.keyPrefix).toBe('');
    expect(connection.accessKeyId).toBe('user');
    expect(connection.secretAccessKey).toBe('password');
  })

  test('minio complete setup', () => {
    const connection = new ConnectionString(cases.minioComplete);
    expect(connection.endpoint).toBe('http://localhost:9000');
    expect(connection.bucket).toBe('my-bucket');
    expect(connection.keyPrefix).toBe('path/to/folder');
    expect(connection.accessKeyId).toBe('user');
    expect(connection.secretAccessKey).toBe('password');
    expect(connection.A).toBe('1');
    expect(connection.B).toBe('2');
  })
});
