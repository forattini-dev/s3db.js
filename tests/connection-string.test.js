import { describe, expect, test } from '@jest/globals';

import ConnectionString from '../src/connection-string.class.js';

describe('ConnectionString Class - Complete Journey', () => {
  test('ConnectionString Journey: Parse → Validate → Build → Transform', () => {
    const s3ConnectionString = 's3://accessKey:secretKey@bucket-name/prefix/path';
    const s3Conn = new ConnectionString(s3ConnectionString);

    expect(s3Conn.bucket).toBe('bucket-name');
    expect(s3Conn.accessKeyId).toBe('accessKey');
    expect(s3Conn.secretAccessKey).toBe('secretKey');
    expect(s3Conn.keyPrefix).toBe('prefix/path');
    expect(s3Conn.endpoint).toBe('https://s3.us-east-1.amazonaws.com');
    expect(s3Conn.region).toBe('us-east-1');
  });

  test('ConnectionString Edge Cases Journey', () => {
    // Test with special characters in credentials
    const specialCharsConnectionString = 'https://user%40domain:pass%23word@s3.amazonaws.com/bucket%20name/prefix/path';
    const specialConn = new ConnectionString(specialCharsConnectionString);

    expect(specialConn.accessKeyId).toBe('user%40domain');
    expect(specialConn.secretAccessKey).toBe('pass%23word');
    expect(specialConn.bucket).toBe('bucket%20name');
    expect(specialConn.keyPrefix).toBe('prefix/path');
  });

  test('ConnectionString Error Handling Journey', () => {
    // Test strings that should throw errors
    expect(() => new ConnectionString('invalid-string')).toThrow(/Invalid connection string/);
    expect(() => new ConnectionString('')).toThrow(/Invalid connection string/);
  });

  test('ConnectionString Configuration Journey', () => {
    // Test default configuration
    const defaultConn = new ConnectionString('https://user:pass@s3.amazonaws.com/bucket');
    
    expect(defaultConn.accessKeyId).toBe('user');
    expect(defaultConn.secretAccessKey).toBe('pass');
    expect(defaultConn.bucket).toBe('bucket');
    expect(defaultConn.region).toBe('us-east-1');
  });

  test('ConnectionString Comparison Journey', () => {
    const conn1 = new ConnectionString('s3://key1:secret1@bucket1/prefix1');
    const conn2 = new ConnectionString('s3://key1:secret1@bucket1/prefix1');
    const conn3 = new ConnectionString('s3://key2:secret2@bucket2/prefix2');

    expect(conn1.bucket).toBe(conn2.bucket);
    expect(conn1.bucket).not.toBe(conn3.bucket);
  });

  test('ConnectionString with empty path and null path', () => {
    // S3 with empty path
    const s3Empty = new ConnectionString('s3://user:pass@bucket');
    expect(s3Empty.keyPrefix).toBe('');
    // Minio with empty path
    const minioEmpty = new ConnectionString('http://user:pass@localhost:9000/');
    expect(minioEmpty.bucket).toBe('s3db');
    expect(minioEmpty.keyPrefix).toBe('');
    // Minio with null path (simulate)
    const url = new URL('http://user:pass@localhost:9000/');
    url.pathname = null;
    // defineMinio should handle null
    const minioConn = new ConnectionString('http://user:pass@localhost:9000/');
    minioConn.defineMinio({ ...url, pathname: null });
    expect(minioConn.bucket).toBe('s3db');
    expect(minioConn.keyPrefix).toBe('');
  });

  test('ConnectionString with query params', () => {
    const conn = new ConnectionString('https://user:pass@s3.amazonaws.com/bucket?foo=bar&baz=qux');
    expect(conn.foo).toBe('bar');
    expect(conn.baz).toBe('qux');
  });
});
