import * as path from "path";
import { chunk } from "lodash";
import { nanoid } from "nanoid";
import { Stream } from "stream";
import EventEmitter from "events";
import { S3, Credentials } from "aws-sdk";
import PromisePool from "@supercharge/promise-pool";

import { ClientNoSuchKey } from "./errors";

export default class S3Client extends EventEmitter {
  id: string;
  client: any;
  bucket: string;
  keyPrefix: string;
  parallelism: number;

  constructor({
    connectionString,
    parallelism = 10,
  }: {
    connectionString: string;
    parallelism?: number;
  }) {
    super();
    this.id = nanoid(7);

    const uri = new URL(connectionString);
    this.bucket = uri.hostname;
    this.parallelism = parallelism;

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
      const options = {
        Bucket: this.bucket,
        Key: path.join(this.keyPrefix, key),
      };

      const response = await this.client.getObject(options).promise();
      this.emit("request", "getObject", options);

      return response;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === "NoSuchKey") {
          return Promise.reject(
            new ClientNoSuchKey({ bucket: this.bucket, key })
          );
        }
      }

      return Promise.reject(error);
    }
  }

  /**
   *
   * @param param0
   * @returns
   */
  async putObject({
    key,
    metadata,
    contentType,
    body,
    contentEncoding,
  }: {
    key: string;
    metadata?: object;
    contentType?: string;
    body: string | Stream | Uint8Array;
    contentEncoding?: string | null | undefined;
  }) {
    try {
      const options: any = {
        Bucket: this.bucket,
        Key: path.join(this.keyPrefix, key),
        Metadata: { ...metadata },
        Body: body,
        ContentType: contentType,
        ContentEncoding: contentEncoding,
      };

      const response = await this.client.putObject(options).promise();
      this.emit("request", "putObject", options);

      return response;
    } catch (error) {
      this.emit("error", error);
      return Promise.reject(error);
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
      const options: any = {
        Bucket: this.bucket,
        Key: path.join(this.keyPrefix, key),
      };

      const response = await this.client.headObject(options).promise();
      this.emit("request", "headObject", options);

      return response;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === "NoSuchKey" || error.name === "NotFound") {
          return Promise.reject(
            new ClientNoSuchKey({ bucket: this.bucket, key })
          );
        }
      }

      this.emit("error", error);
      return Promise.reject(error);
    }
  }

  /**
   * Proxy to AWS S3's deleteObject
   * @param {Object} param
   * @param {string} param.key
   * @returns
   */
  async deleteObject(key: string) {
    try {
      const options: any = {
        Bucket: this.bucket,
        Key: path.join(this.keyPrefix, key),
      };

      const response = await this.client.deleteObject(options).promise();
      this.emit("request", "deleteObject", options);

      return response;
    } catch (error: unknown) {
      this.emit("error", error);

      if (error instanceof Error) {
        if (error.name === "NoSuchKey") {
          return Promise.reject(
            new ClientNoSuchKey({ bucket: this.bucket, key })
          );
        }
      }

      return Promise.reject(error);
    }
  }

  /**
   * Proxy to AWS S3's deleteObjects
   * @param {Object} param
   * @param {string} param.keys
   * @returns
   */
  async deleteObjects(keys: string[]) {
    const packages = chunk(keys, 1000);

    const { results, errors } = await PromisePool.for(packages)
      .withConcurrency(this.parallelism)
      .process(async (keys: string[]) => {
        try {
          const options = {
            Bucket: this.bucket,
            Delete: {
              Objects: keys.map((key) => ({
                Key: path.join(this.keyPrefix, key),
              })),
            },
          };

          const response = await this.client.deleteObjects(options).promise();
          this.emit("request", "deleteObjects", options);

          return response;
        } catch (error: unknown) {
          this.emit("error", error);
          return Promise.reject(error);
        }
      });

    return {
      deleted: results,
      notFound: errors,
    };
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
    prefix?: string;
    maxKeys?: number;
    continuationToken: any;
  }): Promise<S3.ListObjectsV2Output> {
    try {
      const options = {
        Bucket: this.bucket,
        MaxKeys: maxKeys,
        ContinuationToken: continuationToken,
        Prefix: prefix ? path.join(this.keyPrefix, prefix) : this.keyPrefix,
      };

      const response = await this.client.listObjectsV2(options).promise();
      this.emit("request", "listObjectsV2", options);

      return response;
    } catch (error: unknown) {
      this.emit("error", error);
      return Promise.reject(error);
    }
  }

  async count({ prefix }: { prefix?: string } = {}) {
    this.emit("request", "count", { prefix });

    let count = 0;
    let truncated = true;
    let continuationToken;

    while (truncated) {
      const options = {
        prefix,
        continuationToken,
      };

      const res: S3.ListObjectsV2Output = await this.listObjects(options);

      count += res.KeyCount || 0;
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
    }

    return count;
  }

  async getAllKeys({ prefix }: { prefix?: string } = {}) {
    this.emit("request", "getAllKeys", { prefix });

    let keys: any[] = [];
    let truncated = true;
    let continuationToken;

    while (truncated) {
      const options: any = {
        prefix,
        continuationToken,
      };

      const res = await this.listObjects(options);

      if (res.Contents) {
        keys = keys.concat(res.Contents.map((x) => x.Key));
      }

      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
    }

    return keys
      .map((x) => x.replace(this.keyPrefix, ""))
      .map((x) => (x.startsWith("/") ? x.replace(`/`, "") : x));
  }
}
