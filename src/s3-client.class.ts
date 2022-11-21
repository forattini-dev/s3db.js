import * as path from "path";
import { nanoid } from "nanoid";
import { Stream } from "stream";
import { chunk, isObject } from "lodash";
import { S3, Credentials } from "aws-sdk";

import { NoSuchKey } from "./errors";
import PromisePool from "@supercharge/promise-pool";

export default class S3Client {
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
          return Promise.reject(new NoSuchKey({ bucket: this.bucket, key }));
        } else {
          return Promise.reject(new Error(error.name));
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
      const params: any = {
        Bucket: this.bucket,
        Key: path.join(this.keyPrefix, key),
        Metadata: { ...metadata },
        Body: body,
        ContentType: contentType,
        ContentEncoding: contentEncoding,
      };

      return this.client.putObject(params).promise();
    } catch (error) {
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
      const request = await this.client
        ?.headObject({
          Bucket: this.bucket,
          Key: path.join(this.keyPrefix, key),
        })
        .promise();

      return request;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === "NoSuchKey" || error.name === "NotFound") {
          return Promise.reject(new NoSuchKey({ bucket: this.bucket, key }));
        } else {
          return Promise.reject(new Error(error.name));
        }
      }
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
      const request = await this.client
        ?.deleteObject({
          Bucket: this.bucket,
          Key: path.join(this.keyPrefix, key),
        })
        .promise();

      return request;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === "NoSuchKey") {
          return Promise.reject(new NoSuchKey({ bucket: this.bucket, key }));
        } else {
          return Promise.reject(new Error(error.name));
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
          const request = await this.client
            ?.deleteObjects({
              Bucket: this.bucket,
              Delete: {
                Objects: keys.map((key) => ({
                  Key: path.join(this.keyPrefix, key),
                })),
              },
            })
            .promise();

          return request;
        } catch (error: unknown) {
          if (error instanceof Error) {
            return Promise.reject(new Error(error.name));
          }
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
    prefix: string;
    maxKeys?: number;
    continuationToken: any;
  }): Promise<S3.ListObjectsV2Output> {
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
      return Promise.reject(error);
    }
  }
}
