import S3Database from "./s3-database.class";
import S3Client from "./s3-client.class";

export interface MetadataResourceInterface {
  schema: any;
}

export interface ResourceInterface {
  schema: any;
  validator: any;
}

export interface ResourceConfigInterface {
  s3db: S3Database;
  name: string;
  schema: any;
  options?: any;
  cache?: boolean
  s3Client: S3Client;
  validatorInstance: any;
}
