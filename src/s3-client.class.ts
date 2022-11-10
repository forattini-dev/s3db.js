import * as path from "path";
import { isObject } from "lodash";
import { S3, Credentials } from "aws-sdk";

import { NoSuchKey } from "./errors";

export default class S3Client {
  bucket: string;
  keyPrefix: string;
  client: any;

  constructor({ connectionString }: { connectionString: string }) {
    const uri = new URL(connectionString);
    this.bucket = uri.hostname;

    let [, ...subpath] = uri.pathname.split("/");
    this.keyPrefix = [...(subpath || [])].join("/");

    this.client = new S3({
      credentials: new Credentials({
        accessKeyId: uri.username,
        secretAccessKey: uri.password,
      }),
    });
  }

  /**
   *
   * @param param0
   * @returns
   */
  async getObject({ key }: { key: string }) {
    try {
      const request = await this.client
        ?.getObject({
          Bucket: this.bucket,
          Key: path.join(this.keyPrefix, key),
        })
        .promise();

      return request;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === "NoSuchKey") {
          throw new NoSuchKey({ bucket: this.bucket, key });
        } else {
          return Promise.reject(new Error(error.name));
        }
      }
      throw error;
    }
  }

  /**
   *
   * @param param0
   * @returns
   */
  async putObject({
    key,
    body,
    metadata,
  }: {
    key: string;
    body: string | object;
    metadata?: object;
  }) {
    try {
      const request = await this.client
        .putObject({
          Bucket: this.bucket,
          Key: path.join(this.keyPrefix, key),
          Body: Buffer.from(
            isObject(body) ? JSON.stringify(body, null, 2) : body
          ),
          Metadata: { ...metadata },
        })
        .promise();

      return request;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Proxy to AWS S3's headObject
   * @param {Object} param
   * @param {string} param.key
   * @returns
   */
  async headObject({ key }: { key: string }) {
    try {
      const request = await this.client
        ?.headObject({
          Bucket: this.bucket,
          Key: path.join(this.keyPrefix, key),
        })
        .promise();

      return request;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === "NoSuchKey") {
          throw new NoSuchKey({ bucket: this.bucket, key });
        } else {
          return Promise.reject(new Error(error.name));
        }
      }
      throw error;
    }
  }

  /**
   *
   * @param param0
   * @returns
   */
  async listObjects({
    prefix,
    maxKeys = 1000,
    continuationToken,
  }: {
    prefix: string;
    maxKeys?: number;
    continuationToken: any;
  }) : Promise<S3.ListObjectsV2Output> {
    try {
      const request = await this.client
        ?.listObjectsV2({
          Bucket: this.bucket,
          Prefix: path.join(this.keyPrefix, prefix),
          MaxKeys: maxKeys,
          ContinuationToken: continuationToken,
        })
        .promise();

      return request;
    } catch (error: unknown) {
      console.log({ error });
      if (error instanceof Error) {
        return Promise.reject(new Error(error.name));
      }
      throw error;
    }
  }
}
