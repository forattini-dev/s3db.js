import path from "path";
import { idGenerator } from "./concerns/id.js";
import EventEmitter from "events";
import { chunk } from "lodash-es";
import { PromisePool } from "@supercharge/promise-pool";

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

import { ErrorMap } from "./errors.js";
import { ConnectionString } from "./connection-string.class.js";

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
    this.id = id ?? idGenerator();
    this.parallelism = parallelism;
    this.config = new ConnectionString(connectionString);
    this.client = AwsS3Client || this.createClient()
  }

  createClient() {
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
    this.emit("command.request", command.constructor.name, command.input);

    // supress warning for unknown stream length
    const originalWarn = console.warn;

    try {
      console.warn = (message) => {
        if (!message.includes('Stream of unknown length')) {
          originalWarn(message);
        }
      };
    } catch (error) {
      console.error(error);
    }

    const response = await this.client.send(command);
    this.emit("command.response", command.constructor.name, response, command.input);

    // return original console.warn
    try {
      console.warn = originalWarn;
    } catch (error) {
      console.error(error);
    }

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
      Body: body || Buffer.alloc(0),
    };
    
    if (contentType !== undefined) options.ContentType = contentType
    if (contentEncoding !== undefined) options.ContentEncoding = contentEncoding

    try {
      const response = await this.sendCommand(new PutObjectCommand(options));
      this.emit("putObject", response, options);
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
      const response = await this.sendCommand(new GetObjectCommand(options));
      this.emit("getObject", response, options);
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
      const response = await this.sendCommand(new HeadObjectCommand(options));
      this.emit("headObject", response, options);
      return response;
    } catch (error) {
      throw this.errorProxy(error, {
        key,
        command: options,
      });
    }
  }

  async copyObject({ from, to }) {
    const options = {
      Bucket: this.config.bucket,
      Key: this.config.keyPrefix ? path.join(this.config.keyPrefix, to) : to,
      CopySource: path.join(this.config.bucket, this.config.keyPrefix ? path.join(this.config.keyPrefix, from) : from),
    };

    try {
      const response = await this.client.send(new CopyObjectCommand(options));
      this.emit("copyObject", response, options);
      return response;
    } catch (error) {
      throw this.errorProxy(error, {
        from,
        to,
        command: options,
      });
    }
  }

  async exists(key) {
    try {
      await this.headObject(key);
      return true
    } catch (err) {
      if (err.name === "NoSuchKey") return false;
      else if (err.name === "NotFound") return false;

      throw err
    }
  }

  async deleteObject(key) {
    const options = {
      Bucket: this.config.bucket,
      Key: this.config.keyPrefix ? path.join(this.config.keyPrefix, key) : key,
    };

    try {
      const response = await this.sendCommand(new DeleteObjectCommand(options));
      this.emit("deleteObject", response, options);
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
          const response = await this.sendCommand(new DeleteObjectsCommand(options));
          return response;
        } catch (error) {
          throw this.errorProxy(error, {
            keys,
            command: options,
          });
        }
      });

    const report = {
      deleted: results,
      notFound: errors,
    }

    this.emit("deleteObjects", report, keys);
    return report;
  }

  /**
   * Delete all objects under a specific prefix using efficient pagination
   * @param {Object} options - Delete options
   * @param {string} options.prefix - S3 prefix to delete
   * @returns {Promise<number>} Number of objects deleted
   */
  async deleteAll({ prefix } = {}) {
    let continuationToken;
    let totalDeleted = 0;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: this.config.keyPrefix ? path.join(this.config.keyPrefix, prefix) : prefix,
        ContinuationToken: continuationToken,
      });

      const listResponse = await this.client.send(listCommand);

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: {
            Objects: listResponse.Contents.map(obj => ({ Key: obj.Key }))
          }
        });

        const deleteResponse = await this.client.send(deleteCommand);
        const deletedCount = deleteResponse.Deleted ? deleteResponse.Deleted.length : 0;
        totalDeleted += deletedCount;

        this.emit("deleteAll", {
          prefix,
          batch: deletedCount,
          total: totalDeleted
        });
      }

      continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
    } while (continuationToken);

    this.emit("deleteAllComplete", {
      prefix,
      totalDeleted
    });

    return totalDeleted;
  }

  async moveObject({ from, to }) {
    try {
      await this.copyObject({ from, to });
      await this.deleteObject(from);
      return true
    } catch (error) {
      throw this.errorProxy(error, {
        from,
        to,
        command: options,
      });
    }
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
      const response = await this.sendCommand(new ListObjectsV2Command(options));
      this.emit("listObjects", response, options);
      return response;
    } catch (error) {
      throw this.errorProxy(error, { command: options });
    }
  }

  async count({ prefix } = {}) {
    let count = 0;
    let truncated = true;
    let continuationToken;

    while (truncated) {
      const options = {
        prefix,
        continuationToken,
      };

      const response = await this.listObjects(options);

      count += response.KeyCount || 0;
      truncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }

    this.emit("count", count, { prefix });
    return count;
  }

  async getAllKeys({ prefix } = {}) {
    let keys = [];
    let truncated = true;
    let continuationToken;

    while (truncated) {
      const options = {
        prefix,
        continuationToken,
      };

      const response = await this.listObjects(options);

      if (response.Contents) {
        keys = keys.concat(response.Contents.map((x) => x.Key));
      }

      truncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }

    if (this.config.keyPrefix) {
      keys = keys
        .map((x) => x.replace(this.config.keyPrefix, ""))
        .map((x) => (x.startsWith("/") ? x.replace(`/`, "") : x));
    }

    this.emit("getAllKeys", keys, { prefix });
    return keys;
  }

  async getContinuationTokenAfterOffset(params = {}) {
    const {
      prefix,
      offset = 1000,
    } = params

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

    this.emit("getContinuationTokenAfterOffset", continuationToken || null, params);
    return continuationToken || null;
  }

  async getKeysPage(params = {}) {
    const {
      prefix,
      offset = 0,
      amount = 100,
    } = params

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

    this.emit("getKeysPage", keys, params);
    return keys;
  }

  async moveAllObjects({ prefixFrom, prefixTo }) {
    const keys = await this.getAllKeys({ prefix: prefixFrom });

    const { results, errors } = await PromisePool
      .for(keys)
      .withConcurrency(this.parallelism)
      .process(async (key) => {
        const to = key.replace(prefixFrom, prefixTo)

        try {
          await this.moveObject({ 
            from: key, 
            to,
          });
          return to;
        } catch (error) {
          throw this.errorProxy(error, {
            from: key,
            to,
          });
        }
      });

    this.emit("moveAllObjects", { results, errors }, { prefixFrom, prefixTo });

    if (errors.length > 0) {
      throw new Error("Some objects could not be moved");
    }

    return results;
  }
}

export default Client;