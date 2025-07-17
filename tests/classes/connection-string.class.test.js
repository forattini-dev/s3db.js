import { describe, expect, test } from '@jest/globals';

import ConnectionString from '#src/connection-string.class.js';

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
    const specialCharsConnectionString = 'https://user@domain:pass%23word@s3.amazonaws.com/bucket%20name/prefix/path';
    const specialConn = new ConnectionString(specialCharsConnectionString);

    expect(specialConn.accessKeyId).toBe('user@domain');
    expect(specialConn.secretAccessKey).toBe('pass#word');
    expect(specialConn.bucket).toBe('bucket name');
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
    const minioEmpty = new ConnectionString('http://user:pass@localhost:9998/');
    expect(minioEmpty.bucket).toBe('s3db');
    expect(minioEmpty.keyPrefix).toBe('');
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
});

describe('ConnectionString S3-Compatible Providers', () => {
  test('Amazon S3 (default endpoint)', () => {
    const conn = new ConnectionString('s3://ACCESS:SECRET@bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://s3.us-east-1.amazonaws.com');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
    expect(conn.region).toBe('us-east-1');
  });

  test('Amazon S3 (region endpoint)', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@s3.us-west-2.amazonaws.com/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://s3.us-west-2.amazonaws.com');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
  });

  test('Google Cloud Storage (XML API)', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@storage.googleapis.com/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://storage.googleapis.com');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
  });

  test('Wasabi', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@s3.us-west-1.wasabisys.com/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://s3.us-west-1.wasabisys.com');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
  });

  test('Backblaze B2', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@s3.us-west-004.backblazeb2.com/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://s3.us-west-004.backblazeb2.com');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
  });

  test('Linode Object Storage', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@us-east-1.linodeobjects.com/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://us-east-1.linodeobjects.com');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
  });

  test('Vultr Object Storage', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@ewr1.vultrobjects.com/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://ewr1.vultrobjects.com');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
  });

  test('Scaleway Object Storage', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@s3.nl-ams.scw.cloud/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://s3.nl-ams.scw.cloud');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
  });

  test('Cloudflare R2', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@accountid.r2.cloudflarestorage.com/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://accountid.r2.cloudflarestorage.com');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
  });

  test('Storj DCS', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@gateway.storjshare.io/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://gateway.storjshare.io');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
  });

  test('IDrive e2', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@s3.us-west-1.idrivee2-7.com/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://s3.us-west-1.idrivee2-7.com');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
  });

  test('Oracle Cloud', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@objectstorage.us-phoenix-1.oraclecloud.com/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://objectstorage.us-phoenix-1.oraclecloud.com');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
  });

  test('MinIO (localhost)', () => {
    const conn = new ConnectionString('http://ACCESS:SECRET@localhost:9000/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('http://localhost:9000');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
    expect(conn.forcePathStyle).toBe(true);
  });

  test('MinIO (custom domain)', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@minio.mycompany.com/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://minio.mycompany.com');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
    expect(conn.forcePathStyle).toBe(true);
  });

  test('Ceph RGW', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@s3.ceph.mycompany.local/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://s3.ceph.mycompany.local');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
  });

  test('Zenko', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@zenko.local/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://zenko.local');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
  });

  test('Azure via MinIO Gateway', () => {
    const conn = new ConnectionString('http://ACCESS:SECRET@minio-gateway.local:9000/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('http://minio-gateway.local:9000');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
    expect(conn.forcePathStyle).toBe(true);
  });

  test('DigitalOcean Spaces (sgp1 region)', () => {
    const conn = new ConnectionString('https://ACCESS:SECRET@sgp1.digitaloceanspaces.com/bucket-name/prefix/path');
    expect(conn.endpoint).toBe('https://sgp1.digitaloceanspaces.com');
    expect(conn.bucket).toBe('bucket-name');
    expect(conn.accessKeyId).toBe('ACCESS');
    expect(conn.secretAccessKey).toBe('SECRET');
    expect(conn.keyPrefix).toBe('prefix/path');
    expect(conn.forcePathStyle).toBe(true);
  });
});