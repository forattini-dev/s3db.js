import * as path from "path";
import shortid from "shortid";
import { Stream } from "stream";
import { isObject } from "lodash";
import { S3, Credentials } from "aws-sdk";

import { NoSuchKey } from "./errors";

export default class S3Client {
  id: string;
  client: any;
  bucket: string;
  keyPrefix: string;

  constructor({ connectionString }: { connectionString: string }) {
    this.id = shortid.generate();

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
      throw Promise.reject(error);
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
      throw error;
    }
  }
}
