// single
export * from './client.class.js'
export * from './connection-string.class.js'
export * from './crypto.js'
export * from './database.class.js'
export * from './errors.js'
export * from './validator.class.js'

// directories
export * from './cache/index.js'
export * from './plugins/index.js'
export * from './stream/index.js'

// default
export { default as S3db } from './database.class.js'
export { S3db as default } from './database.class.js'
export { S3db as S3DB } from './database.class.js'

// Re-export error classes with aliases for compatibility
export { S3DBError, S3DBError as S3dbError } from './errors.js'
export { ValidationError } from './errors.js'
export { EncryptionError } from './errors.js'
export { ResourceNotFound as ResourceNotFoundError } from './errors.js'
export { AuthenticationError } from './errors.js'
export { PermissionError } from './errors.js'
export { DatabaseError } from './errors.js'

// Re-export utility functions
export { encrypt, decrypt } from './crypto.js'
