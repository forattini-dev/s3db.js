import { S3Database } from "../s3-database.class";

export interface Plugin {
  setup(s3db: S3Database): void | Promise<void>;
  start(): void | Promise<void>;
}

export default Plugin;
