import {
  // classes
  S3db,
  Cache,
  Client,
  Plugin,
  S3Cache,
  Database,
  Validator,
  CachePlugin,
  MemoryCache,
  ConnectionString,
  ResourceReader,
  ResourceWriter,
  ResourceIdsReader,
  ResourceIdsPageReader,
  
  // objects
  ErrorMap,
  PluginObject,
  ValidatorManager,

  // functions
  encrypt,
  decrypt,
  streamToString,

  // errors
  BaseError,
  NotFound,
  NoSuchKey,
  NoSuchBucket,
  UnknownError,
  MissingMetadata,
  InvalidResourceItem,
} from "../dist/s3db.es.js"

describe("Bundle package", () => {
  [
    // classes
    S3db,
    Cache,
    Client,
    Plugin,
    S3Cache,
    Database,
    Validator,
    CachePlugin,
    MemoryCache,
    ConnectionString,
    ResourceReader,
    ResourceWriter,
    ResourceIdsReader,
    ResourceIdsPageReader,
    
    // objects
    ErrorMap,
    PluginObject,
    ValidatorManager,

    // functions
    encrypt,
    decrypt,
    streamToString,

    // errors
    BaseError,
    NotFound,
    NoSuchKey,
    NoSuchBucket,
    UnknownError,
    MissingMetadata,
    InvalidResourceItem,
  ].forEach((target) => {
    it(`should export ${target.name || target.constructor.name || 'function'}`, () => {
      expect(target).toBeDefined()
    })
  })
})
