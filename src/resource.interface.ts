import S3db from "./s3db.class";
import S3Client from "./s3-client.class";

export interface MetadataResourceInterface {
  schema: any;
}

export interface ResourceInterface {
  schema: any;
  validator: any;
}

export interface ResourceConfigInterface {
  s3db: S3db;
  name: string;
  schema: any;
  options?: any;
  s3Client: S3Client;
  validatorInstance: any;
}
