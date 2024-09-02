import path from "path";
import { nanoid } from "nanoid";
import { chunk } from "lodash-es";
import EventEmitter from "events";
import { PromisePool } from "@supercharge/promise-pool";

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

import { ErrorMap } from "./errors";
import { ConnectionString } from "./connection-string.class";

export class Client extends EventEmitter {
  constructor({
    verbose = false,
    id = null,
    AwsS3Client,
    connectionString,
    parallelism = 10,
  }) {
    super();
    this.verbose = verbose;
    this.id = id ?? nanoid(7);
    this.parallelism = parallelism;
    this.config = new ConnectionString(connectionString);
    this.client = AwsS3Client || this.createS3Client()
  }

  createS3Client() {
    let options = {
      region: this.config.region,
      endpoint: this.config.endpoint,
    }

    if (this.config.forcePathStyle) options.forcePathStyle = true

    if (this.config.accessKeyId) {
      options.credentials = {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      }
    }

    return new S3Client(options)
  }

  async sendCommand(command) {
    this.emit("command", command.constructor.name, command.input);
    const response = await this.client.send(command);
    return response;
  }

  errorProxy(error, data) {
    if (this.verbose) {
      data.bucket = this.config.bucket
      data.config = this.config
      data.verbose = this.verbose
    }

    error.data = data;

    const errorClass = ErrorMap[error.name];
    if (errorClass) return new errorClass(data);

    return error;
  }

  async putObject({ key, metadata, contentType, body, contentEncoding }) {
    const options = {
      Bucket: this.config.bucket,
      Key: this.config.keyPrefix ? path.join(this.config.keyPrefix, key) : key,
      Metadata: { ...metadata },
      Body: body || "@",
      ContentType: contentType,
      ContentEncoding: contentEncoding,
    };

    try {
      this.emit("request", "putObject", options);
      const response = await this.sendCommand(new PutObjectCommand(options));

      this.emit("response", "putObject", options, response);
      this.emit("putObject", options, response);

      return response;
    } catch (error) {
      throw this.errorProxy(error, {
        key,
        command: options,
      })
    }
  }

  async getObject(key) {
    const options = {
      Bucket: this.config.bucket,
      Key: path.join(this.config.keyPrefix, key),
    };

    try {
      this.emit("request", "getObject", options);
      const response = await this.sendCommand(new GetObjectCommand(options));

      this.emit("response", "getObject", options, response);
      this.emit("getObject", options, response);

      return response;
    } catch (error) {
      throw this.errorProxy(error, {
        key,
        command: options,
      });
    }
  }

  async headObject(key) {
    const options = {
      Bucket: this.config.bucket,
      Key: this.config.keyPrefix ? path.join(this.config.keyPrefix, key) : key,
    };

    try {
      this.emit("request", "headObject", options);
      const response = await this.client.send(new HeadObjectCommand(options));
      // const response = await this.sendCommand(new HeadObjectCommand(options));

      this.emit("response", "headObject", options, response);
      this.emit("headObject", options, response);

      return response;
    } catch (error) {
      throw this.errorProxy(error, {
        key,
        command: options,
      });
    }

  }

  async exists(key) {
    try {
      await this.headObject(key);
      return true
    } catch (errorExists) {
      if (errorExists.name === "NoSuchKey") return false;
      if (errorExists.name === "NotFound") return false;
      throw errorExists
    }
    return false;
  }

  async deleteObject(key) {
    const options = {
      Bucket: this.config.bucket,
      Key: this.config.keyPrefix ? path.join(this.config.keyPrefix, key) : key,
    };

    try {
      this.emit("request", "deleteObject", options);
      const response = await this.sendCommand(new DeleteObjectCommand(options));

      this.emit("response", "deleteObject", options, response);
      this.emit("deleteObject", options, response);

      return response;
    } catch (error) {
      throw this.errorProxy(error, {
        key,
        command: options,
      });
    }
  }

  async deleteObjects(keys) {
    const packages = chunk(keys, 1000);

    const { results, errors } = await PromisePool.for(packages)
      .withConcurrency(this.parallelism)
      .process(async (keys) => {
        const options = {
          Bucket: this.config.bucket,
          Delete: {
            Objects: keys.map((key) => ({
              Key: this.config.keyPrefix
                ? path.join(this.config.keyPrefix, key)
                : key,
            })),
          },
        };

        try {
          this.emit("request", "deleteObjects", options);
          const response = await this.sendCommand(new DeleteObjectsCommand(options));

          this.emit("response", "deleteObjects", options, response);
          this.emit("deleteObjects", options, response);

          return response;
        } catch (error) {
          throw this.errorProxy(error, {
            key,
            command: options,
          });
        }
      });

    return {
      deleted: results,
      notFound: errors,
    };
  }

  async listObjects({
    prefix,
    maxKeys = 1000,
    continuationToken,
  } = {}) {
    const options = {
      Bucket: this.config.bucket,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
      Prefix: this.config.keyPrefix
        ? path.join(this.config.keyPrefix, prefix || "")
        : prefix || "",
    };

    try {
      this.emit("request", "listObjectsV2", options);
      const response = await this.sendCommand(new ListObjectsV2Command(options));

      this.emit("response", "listObjectsV2", options, response);
      this.emit("listObjectsV2", options, response);

      return response;
    } catch (error) {
      throw this.errorProxy(error, { command: options });
    }
  }

  async count({ prefix } = {}) {
    this.emit("request", "count", { prefix });

    let count = 0;
    let truncated = true;
    let continuationToken;

    while (truncated) {
      const options = {
        prefix,
        continuationToken,
      };

      const res = await this.listObjects(options);

      count += res.KeyCount || 0;
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
    }

    this.emit("response", "count", { prefix }, count);
    this.emit("count", { prefix }, count);

    return count;
  }

  async getAllKeys({ prefix } = {}) {
    this.emit("request", "getAllKeys", { prefix });

    let keys = [];
    let truncated = true;
    let continuationToken;

    while (truncated) {
      const options = {
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

    if (this.config.keyPrefix) {
      keys = keys
        .map((x) => x.replace(this.config.keyPrefix, ""))
        .map((x) => (x.startsWith("/") ? x.replace(`/`, "") : x));
    }

    this.emit("response", "getAllKeys", { prefix }, keys);
    this.emit("getAllKeys", { prefix }, keys);

    return keys;
  }

  async getContinuationTokenAfterOffset({
    prefix,
    offset = 1000,
  }) {
    if (offset === 0) return null;

    let truncated = true;
    let continuationToken;
    let skipped = 0;

    while (truncated) {
      let maxKeys =
        offset < 1000
          ? offset
          : offset - skipped > 1000
            ? 1000
            : offset - skipped;

      const options = {
        prefix,
        maxKeys,
        continuationToken,
      };

      const res = await this.listObjects(options);

      if (res.Contents) {
        skipped += res.Contents.length;
      }

      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;

      if (skipped >= offset) {
        break;
      }
    }

    return continuationToken;
  }

  async getKeysPage({
    prefix,
    offset = 0,
    amount = 100,
  } = {}) {
    let keys = [];
    let truncated = true;
    let continuationToken;

    if (offset > 0) {
      continuationToken = await this.getContinuationTokenAfterOffset({
        prefix,
        offset,
      });
    }

    while (truncated) {
      const options = {
        prefix,
        continuationToken,
      };

      const res = await this.listObjects(options);

      if (res.Contents) {
        keys = keys.concat(res.Contents.map((x) => x.Key));
      }

      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;

      if (keys.length > amount) {
        keys = keys.splice(0, amount);
        break;
      }
    }

    if (this.config.keyPrefix) {
      keys = keys
        .map((x) => x.replace(this.config.keyPrefix, ""))
        .map((x) => (x.startsWith("/") ? x.replace(`/`, "") : x));
    }

    return keys;
  }
}

export default Client;