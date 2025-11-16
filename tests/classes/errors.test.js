import { describe, test, expect } from '@jest/globals'
import {
  BaseError,
  S3dbError,
  DatabaseError,
  ValidationError,
  AuthenticationError,
  PermissionError,
  EncryptionError,
  ResourceNotFound,
  NoSuchBucket,
  NoSuchKey,
  NotFound,
  MissingMetadata,
  InvalidResourceItem,
  UnknownError,
  ConnectionStringError,
  CryptoError,
  SchemaError,
  ResourceError,
  PartitionError
} from '#src/errors.js'

describe('BaseError', () => {
  test('constructs and sets fields', () => {
    const err = new BaseError({ message: 'base', bucket: 'b', key: 'k' })
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('base')
    expect(err.bucket).toBe('b')
    expect(err.key).toBe('k')
    expect(err.message).not.toContain('[object')
  })
  test('toJSON and toString', () => {
    const err = new BaseError({ message: 'base', bucket: 'b', key: 'k' })
    const json = err.toJSON()
    expect(json).toHaveProperty('name', 'BaseError')
    expect(json).toHaveProperty('message', 'base')
    expect(json).toHaveProperty('bucket', 'b')
    expect(json).toHaveProperty('key', 'k')
    const str = err.toString()
    expect(typeof str).toBe('string')
    expect(str).toContain('BaseError')
    expect(str).toContain('base')
    expect(str).not.toContain('[object')
  })

  describe('S3dbError', () => {
    test('constructs and sets fields', () => {
      const err = new S3dbError('msg', { bucket: 'b', key: 'k' })
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toBe('msg')
      expect(err.bucket).toBe('b')
      expect(err.key).toBe('k')
      expect(err.message).not.toContain('[object')
    })
    test('toJSON and toString', () => {
      const err = new S3dbError('msg', { bucket: 'b', key: 'k' })
      const json = err.toJSON()
      expect(json).toHaveProperty('name', 'S3dbError')
      expect(json).toHaveProperty('message', 'msg')
      expect(json).toHaveProperty('bucket', 'b')
      expect(json).toHaveProperty('key', 'k')
      const str = err.toString()
      expect(typeof str).toBe('string')
      expect(str).toContain('S3dbError')
      expect(str).toContain('msg')
      expect(str).not.toContain('[object')
    })

    describe('DatabaseError', () => {
      test('constructs', () => {
        const err = new DatabaseError('db', { bucket: 'b' })
        expect(err.message).toBe('db')
        expect(err.bucket).toBe('b')
      })
    })
    describe('ValidationError', () => {
      test('constructs', () => {
        const err = new ValidationError('val', { bucket: 'b' })
        expect(err.message).toBe('val')
        expect(err.bucket).toBe('b')
      })
    })
    describe('AuthenticationError', () => {
      test('constructs', () => {
        const err = new AuthenticationError('auth', { bucket: 'b' })
        expect(err.message).toBe('auth')
        expect(err.bucket).toBe('b')
      })
    })
    describe('PermissionError', () => {
      test('constructs', () => {
        const err = new PermissionError('perm', { bucket: 'b' })
        expect(err.message).toBe('perm')
        expect(err.bucket).toBe('b')
      })
    })
    describe('EncryptionError', () => {
      test('constructs', () => {
        const err = new EncryptionError('enc', { bucket: 'b' })
        expect(err.message).toBe('enc')
        expect(err.bucket).toBe('b')
      })
    })
    describe('UnknownError', () => {
      test('constructs', () => {
        const err = new UnknownError('unknown', { bucket: 'b' })
        expect(err.message).toBe('unknown')
        expect(err.bucket).toBe('b')
      })
    })
    describe('ConnectionStringError', () => {
      test('constructs', () => {
        const err = new ConnectionStringError('conn', { bucket: 'b' })
        expect(err.message).toBe('conn')
        expect(err.bucket).toBe('b')
      })
    })
    describe('CryptoError', () => {
      test('constructs', () => {
        const err = new CryptoError('crypto', { bucket: 'b' })
        expect(err.message).toBe('crypto')
        expect(err.bucket).toBe('b')
      })
    })
    describe('SchemaError', () => {
      test('constructs', () => {
        const err = new SchemaError('schema', { bucket: 'b' })
        expect(err.message).toBe('schema')
        expect(err.bucket).toBe('b')
      })
    })
    describe('ResourceError', () => {
      test('constructs', () => {
        const err = new ResourceError('resource', { bucket: 'b' })
        expect(err.message).toBe('resource')
        expect(err.bucket).toBe('b')
      })
    })
    describe('PartitionError', () => {
      test('constructs', () => {
        const err = new PartitionError('partition', { bucket: 'b' })
        expect(err.message).toBe('partition')
        expect(err.bucket).toBe('b')
      })
    })
    describe('ResourceNotFound', () => {
      test('requires bucket, resourceName, id', () => {
        expect(() => new ResourceNotFound({ bucket: 'b', resourceName: 'r', id: 'i' })).not.toThrow()
        expect(() => new ResourceNotFound({ resourceName: 'r', id: 'i' })).toThrow()
        expect(() => new ResourceNotFound({ bucket: 'b', id: 'i' })).toThrow()
        expect(() => new ResourceNotFound({ bucket: 'b', resourceName: 'r' })).toThrow()
      })
      test('id, bucket, resourceName must be strings', () => {
        expect(() => new ResourceNotFound({ bucket: {}, resourceName: 'r', id: 'i' })).toThrow()
        expect(() => new ResourceNotFound({ bucket: 'b', resourceName: {}, id: 'i' })).toThrow()
        expect(() => new ResourceNotFound({ bucket: 'b', resourceName: 'r', id: {} })).toThrow()
        expect(() => new ResourceNotFound({ bucket: 123, resourceName: 'r', id: 'i' })).toThrow()
        expect(() => new ResourceNotFound({ bucket: 'b', resourceName: 123, id: 'i' })).toThrow()
        expect(() => new ResourceNotFound({ bucket: 'b', resourceName: 'r', id: 123 })).toThrow()
        expect(() => new ResourceNotFound({ bucket: null, resourceName: 'r', id: 'i' })).toThrow()
        expect(() => new ResourceNotFound({ bucket: 'b', resourceName: null, id: 'i' })).toThrow()
        expect(() => new ResourceNotFound({ bucket: 'b', resourceName: 'r', id: null })).toThrow()
      })
    })
    describe('NoSuchBucket', () => {
      test('requires bucket', () => {
        expect(() => new NoSuchBucket({ bucket: 'b' })).not.toThrow()
        expect(() => new NoSuchBucket({})).toThrow()
      })
      test('bucket must be string', () => {
        expect(() => new NoSuchBucket({ bucket: {} })).toThrow()
        expect(() => new NoSuchBucket({ bucket: 123 })).toThrow()
        expect(() => new NoSuchBucket({ bucket: null })).toThrow()
      })
    })
    describe('NoSuchKey', () => {
      test('requires bucket and key', () => {
        expect(() => new NoSuchKey({ bucket: 'b', key: 'k' })).not.toThrow()
        expect(() => new NoSuchKey({ key: 'k' })).toThrow()
        expect(() => new NoSuchKey({ bucket: 'b' })).toThrow()
      })
      test('bucket and key must be strings', () => {
        expect(() => new NoSuchKey({ bucket: {}, key: 'k' })).toThrow()
        expect(() => new NoSuchKey({ bucket: 'b', key: {} })).toThrow()
        expect(() => new NoSuchKey({ bucket: 123, key: 'k' })).toThrow()
        expect(() => new NoSuchKey({ bucket: 'b', key: 123 })).toThrow()
        expect(() => new NoSuchKey({ bucket: null, key: 'k' })).toThrow()
        expect(() => new NoSuchKey({ bucket: 'b', key: null })).toThrow()
      })
      test('id must be string if provided', () => {
        expect(() => new NoSuchKey({ bucket: 'b', key: 'k', id: {} })).toThrow()
        expect(() => new NoSuchKey({ bucket: 'b', key: 'k', id: 123 })).toThrow()
        expect(() => new NoSuchKey({ bucket: 'b', key: 'k', id: null })).toThrow()
      })
    })
    describe('NotFound', () => {
      test('requires bucket and key', () => {
        expect(() => new NotFound({ bucket: 'b', key: 'k' })).not.toThrow()
        expect(() => new NotFound({ key: 'k' })).toThrow()
        expect(() => new NotFound({ bucket: 'b' })).toThrow()
      })
      test('bucket and key must be strings', () => {
        expect(() => new NotFound({ bucket: {}, key: 'k' })).toThrow()
        expect(() => new NotFound({ bucket: 'b', key: {} })).toThrow()
        expect(() => new NotFound({ bucket: 123, key: 'k' })).toThrow()
        expect(() => new NotFound({ bucket: 'b', key: 123 })).toThrow()
        expect(() => new NotFound({ bucket: null, key: 'k' })).toThrow()
        expect(() => new NotFound({ bucket: 'b', key: null })).toThrow()
      })
    })
    describe('MissingMetadata', () => {
      test('requires bucket', () => {
        expect(() => new MissingMetadata({ bucket: 'b' })).not.toThrow()
        expect(() => new MissingMetadata({})).toThrow()
      })
      test('bucket must be string', () => {
        expect(() => new MissingMetadata({ bucket: {} })).toThrow()
        expect(() => new MissingMetadata({ bucket: 123 })).toThrow()
        expect(() => new MissingMetadata({ bucket: null })).toThrow()
      })
    })
    describe('InvalidResourceItem', () => {
      test('requires bucket and resourceName', () => {
        expect(() => new InvalidResourceItem({ bucket: 'b', resourceName: 'r', attributes: {}, validation: [] })).not.toThrow()
        expect(() => new InvalidResourceItem({ resourceName: 'r', attributes: {}, validation: [] })).toThrow()
        expect(() => new InvalidResourceItem({ bucket: 'b', attributes: {}, validation: [] })).toThrow()
      })
      test('bucket and resourceName must be strings', () => {
        expect(() => new InvalidResourceItem({ bucket: {}, resourceName: 'r', attributes: {}, validation: [] })).toThrow()
        expect(() => new InvalidResourceItem({ bucket: 'b', resourceName: {}, attributes: {}, validation: [] })).toThrow()
        expect(() => new InvalidResourceItem({ bucket: 123, resourceName: 'r', attributes: {}, validation: [] })).toThrow()
        expect(() => new InvalidResourceItem({ bucket: 'b', resourceName: 123, attributes: {}, validation: [] })).toThrow()
        expect(() => new InvalidResourceItem({ bucket: null, resourceName: 'r', attributes: {}, validation: [] })).toThrow()
        expect(() => new InvalidResourceItem({ bucket: 'b', resourceName: null, attributes: {}, validation: [] })).toThrow()
      })
    })
  })
}) 