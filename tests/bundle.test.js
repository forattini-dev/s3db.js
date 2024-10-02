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
  
  // objects
  ErrorMap,
  PluginObject,
  ValidatorManager,

  // functions
  encrypt,
  decrypt,

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
    
    // objects
    ErrorMap,
    PluginObject,
    ValidatorManager,

    // functions
    encrypt,
    decrypt,

    // errors
    BaseError,
    NotFound,
    NoSuchKey,
    NoSuchBucket,
    UnknownError,
    MissingMetadata,
    InvalidResourceItem,
  ].forEach((target) => {
    it(`should export ${target.name || target.constructor.name}`, () => {
      expect(target).toBeDefined()
    })
  })
})
