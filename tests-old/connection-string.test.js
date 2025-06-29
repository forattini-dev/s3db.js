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

  test('ConnectionString S3 defineS3 else branch (single segment)', () => {
    const s3Conn = new ConnectionString('s3://user:pass@bucket/prefix');
    expect(s3Conn.keyPrefix).toBe('prefix');
  });

  test('ConnectionString Minio defineMinio else branch (single segment)', () => {
    const minioConn = new ConnectionString('http://user:pass@localhost:9000/bucket');
    expect(minioConn.bucket).toBe('bucket');
    expect(minioConn.keyPrefix).toBe('');
  });

  test('ConnectionString Minio defineMinio else branch (multiple segments)', () => {
    const minioConn = new ConnectionString('http://user:pass@localhost:9000/bucket/prefix1/prefix2');
    expect(minioConn.bucket).toBe('bucket');
    expect(minioConn.keyPrefix).toBe('prefix1/prefix2');
  });
});

describe('ConnectionString DigitalOcean Spaces', () => {
  test('should parse DigitalOcean Spaces connection string and set correct endpoint/region/forcePathStyle', () => {
    // Simula uma connection string típica para DigitalOcean Spaces
    const region = 'nyc3';
    const bucket = 'my-space';
    const accessKey = 'SPACES_KEY';
    const secretKey = 'SPACES_SECRET';
    const endpoint = `https://${region}.digitaloceanspaces.com`;
    // Formato padrão: https://ACCESS:SECRET@nyc3.digitaloceanspaces.com/my-space
    const connStr = `https://${accessKey}:${secretKey}@${region}.digitaloceanspaces.com/${bucket}`;
    const conn = new ConnectionString(connStr);
    expect(conn.endpoint).toBe(`https://${region}.digitaloceanspaces.com`);
    expect(conn.region).toBe('us-east-1'); // region padrão para compatibilidade
    expect(conn.bucket).toBe('my-space');
    expect(conn.accessKeyId).toBe(accessKey);
    expect(conn.secretAccessKey).toBe(secretKey);
    // forcePathStyle é true para MinIO-like (incluindo DigitalOcean Spaces)
    expect(conn.forcePathStyle).toBe(true);
  });

  test('should allow custom region and forcePathStyle for DigitalOcean Spaces', () => {
    const region = 'nyc3';
    const bucket = 'my-space';
    const accessKey = 'SPACES_KEY';
    const secretKey = 'SPACES_SECRET';
    const endpoint = `https://${region}.digitaloceanspaces.com`;
    // Adiciona query params para customização
    const connStr = `https://${accessKey}:${secretKey}@${region}.digitaloceanspaces.com/${bucket}?region=us-east-1&forcePathStyle=false`;
    const conn = new ConnectionString(connStr);
    expect(conn.endpoint).toBe(endpoint);
    expect(conn.region).toBe('us-east-1');
    expect(conn.forcePathStyle).toBe('false');
  });

  test('should parse DigitalOcean Spaces connection string with prefix', () => {
    const region = 'nyc3';
    const bucket = 'my-space';
    const accessKey = 'SPACES_KEY';
    const secretKey = 'SPACES_SECRET';
    const connStr = `https://${accessKey}:${secretKey}@${region}.digitaloceanspaces.com/${bucket}/folder1/folder2`;
    const conn = new ConnectionString(connStr);
    expect(conn.bucket).toBe('my-space');
    expect(conn.keyPrefix).toBe('folder1/folder2');
  });
});
