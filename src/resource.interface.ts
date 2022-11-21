import S3db from "./s3db.class";
import S3Client from "./s3-client.class";

export interface ResourceInterface {
  schema: any;
  validator: any;
}

export interface ResourceConfigInterface {
  s3db: S3db;
  s3Client: S3Client;
  name: string;
  schema: any;
  validatorInstance: any;
}
