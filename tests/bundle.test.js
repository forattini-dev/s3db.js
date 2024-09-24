import {
  // classes
  S3db,
  Client,
  Plugin,
  Database,
  Validator,
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
  InvalidResourceItem,
  MissingMetadata,
} from "../dist/s3db.es.js"

describe("Bundle package", () => {
  [
    // classes
    S3db,
    Client,
    Plugin,
    Database,
    Validator,
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
  ].forEach((name) => {
    it(`should export ${name.name}`, () => {
      expect(name).toBeDefined()
    })
  })
})
