// directories (keep wildcard exports for these)
export * from './concerns/index.js'
export * from './plugins/index.js'
export * from './errors.js'

// main classes (explicit named exports for better tree-shaking)
export { Database as S3db } from './database.class.js'
export { Database } from './database.class.js'
export { Client } from './client.class.js'
export { Resource } from './resource.class.js'
export { Schema } from './schema.class.js'
export { Validator } from './validator.class.js'
export { ConnectionString } from './connection-string.class.js'

// stream classes
export {
  ResourceReader,
  ResourceWriter,
  ResourceIdsReader,
  ResourceIdsPageReader,
  streamToString
} from './stream/index.js'

// typescript generation
export { generateTypes, printTypes } from './concerns/typescript-generator.js'

// testing utilities
export { Factory, Seeder } from './testing/index.js'

// behaviors
export {
  behaviors,
  getBehavior,
  AVAILABLE_BEHAVIORS,
  DEFAULT_BEHAVIOR
} from './behaviors/index.js'

// default
export { S3db as default } from './database.class.js'
