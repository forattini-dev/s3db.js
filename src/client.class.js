import path from "path";
import EventEmitter from "events";
import { chunk } from "lodash-es";
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { PromisePool } from "@supercharge/promise-pool";
import { NodeHttpHandler } from '@smithy/node-http-handler';

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

import tryFn from "./concerns/try-fn.js";
import { md5 } from "./concerns/crypto.js";
import { idGenerator } from "./concerns/id.js";
import { metadataEncode, metadataDecode } from "./concerns/metadata-encoding.js";
import { ConnectionString } from "./connection-string.class.js";
import { mapAwsError, UnknownError, NoSuchKey, NotFound } from "./errors.js";

export class Client extends EventEmitter {
  constructor({
    verbose = false,
    id = null,
    AwsS3Client,
    connectionString,
    parallelism = 10,
    httpClientOptions = {},
  }) {
    super();
    this.verbose = verbose;
    this.id = id ?? idGenerator(77);
    this.parallelism = parallelism;
    this.config = new ConnectionString(connectionString);
    this.httpClientOptions = {
      keepAlive: true, // Enabled for better performance
      keepAliveMsecs: 1000, // 1 second keep-alive
      maxSockets: httpClientOptions.maxSockets || 500, // High concurrency support
      maxFreeSockets: httpClientOptions.maxFreeSockets || 100, // Better connection reuse
      timeout: 60000, // 60 second timeout
      ...httpClientOptions,
    };
    this.client = AwsS3Client || this.createClient()
  }

  createClient() {
    // Create HTTP agents with keep-alive configuration
    const httpAgent = new HttpAgent(this.httpClientOptions);
    const httpsAgent = new HttpsAgent(this.httpClientOptions);

    // Create HTTP handler with agents
    const httpHandler = new NodeHttpHandler({
      httpAgent,
      httpsAgent,
    });

    let options = {
      region: this.config.region,
      endpoint: this.config.endpoint,
      requestHandler: httpHandler,
    }

    if (this.config.forcePathStyle) options.forcePathStyle = true

    if (this.config.accessKeyId) {
      options.credentials = {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      }
    }

    const client = new S3Client(options);

    // Adiciona middleware para Content-MD5 em DeleteObjectsCommand
    client.middlewareStack.add(
      (next, context) => async (args) => {
        if (context.commandName === 'DeleteObjectsCommand') {
          const body = args.request.body;
          if (body && typeof body === 'string') {
            const contentMd5 = await md5(body);
            args.request.headers['Content-MD5'] = contentMd5;
          }
        }
        return next(args);
      },
      {
        step: 'build',
        name: 'addContentMd5ForDeleteObjects',
        priority: 'high',
      }
    );

    return client;
  }

  async sendCommand(command) {
    this.emit("command.request", command.constructor.name, command.input);
    const [ok, err, response] = await tryFn(() => this.client.send(command));
    if (!ok) {
      const bucket = this.config.bucket;
      const key = command.input && command.input.Key;
      throw mapAwsError(err, {
        bucket,
        key,
        commandName: command.constructor.name,
        commandInput: command.input,
      });
    }
    this.emit("command.response", command.constructor.name, response, command.input);
    return response;
  }

  async putObject({ key, metadata, contentType, body, contentEncoding, contentLength, ifMatch }) {
    const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
    const fullKey = keyPrefix ? path.join(keyPrefix, key) : key;

    // Ensure all metadata values are strings and use smart encoding
    const stringMetadata = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        // Ensure key is a valid string
        const validKey = String(k).replace(/[^a-zA-Z0-9\-_]/g, '_');

        // Smart encode the value
        const { encoded } = metadataEncode(v);
        stringMetadata[validKey] = encoded;
      }
    }

    const options = {
      Bucket: this.config.bucket,
      Key: keyPrefix ? path.join(keyPrefix, key) : key,
      Metadata: stringMetadata,
      Body: body || Buffer.alloc(0),
    };

    if (contentType !== undefined) options.ContentType = contentType
    if (contentEncoding !== undefined) options.ContentEncoding = contentEncoding
    if (contentLength !== undefined) options.ContentLength = contentLength
    if (ifMatch !== undefined) options.IfMatch = ifMatch

    const [ok, err, response] = await tryFn(() => this.sendCommand(new PutObjectCommand(options)));
    this.emit('putObject', err || response, { key, metadata, contentType, body, contentEncoding, contentLength });

    if (!ok) {
      throw mapAwsError(err, {
        bucket: this.config.bucket,
        key,
        commandName: 'PutObjectCommand',
        commandInput: options,
      });
    }

    return response;
  }

  async getObject(key) {
    const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
    const options = {
      Bucket: this.config.bucket,
      Key: keyPrefix ? path.join(keyPrefix, key) : key,
    };

    const [ok, err, response] = await tryFn(async () => {
      const res = await this.sendCommand(new GetObjectCommand(options));

      // Smart decode metadata values
      if (res.Metadata) {
        const decodedMetadata = {};
        for (const [key, value] of Object.entries(res.Metadata)) {
          decodedMetadata[key] = metadataDecode(value);
        }
        res.Metadata = decodedMetadata;
      }

      return res;
    });

    this.emit('getObject', err || response, { key });

    if (!ok) {
      throw mapAwsError(err, {
        bucket: this.config.bucket,
        key,
        commandName: 'GetObjectCommand',
        commandInput: options,
      });
    }

    return response;
  }

  async headObject(key) {
    const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
    const options = {
      Bucket: this.config.bucket,
      Key: keyPrefix ? path.join(keyPrefix, key) : key,
    };

    const [ok, err, response] = await tryFn(() => this.sendCommand(new HeadObjectCommand(options)));
    this.emit('headObject', err || response, { key });

    if (!ok) {
      throw mapAwsError(err, {
        bucket: this.config.bucket,
        key,
        commandName: 'HeadObjectCommand',
        commandInput: options,
      });
    }

    return response;
  }

  async copyObject({ from, to }) {
    const options = {
      Bucket: this.config.bucket,
      Key: this.config.keyPrefix ? path.join(this.config.keyPrefix, to) : to,
      CopySource: path.join(this.config.bucket, this.config.keyPrefix ? path.join(this.config.keyPrefix, from) : from),
    };

    const [ok, err, response] = await tryFn(() => this.sendCommand(new CopyObjectCommand(options)));
    this.emit('copyObject', err || response, { from, to });

    if (!ok) {
      throw mapAwsError(err, {
        bucket: this.config.bucket,
        key: to,
        commandName: 'CopyObjectCommand',
        commandInput: options,
      });
    }

    return response;
  }

  async exists(key) {
    const [ok, err] = await tryFn(() => this.headObject(key));
    if (ok) return true;
    if (err.name === "NoSuchKey" || err.name === "NotFound") return false;
    throw err;
  }

  async deleteObject(key) {
    const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
    const fullKey = keyPrefix ? path.join(keyPrefix, key) : key;
    const options = {
      Bucket: this.config.bucket,
      Key: keyPrefix ? path.join(keyPrefix, key) : key,
    };

    const [ok, err, response] = await tryFn(() => this.sendCommand(new DeleteObjectCommand(options)));
    this.emit('deleteObject', err || response, { key });

    if (!ok) {
      throw mapAwsError(err, {
        bucket: this.config.bucket,
        key,
        commandName: 'DeleteObjectCommand',
        commandInput: options,
      });
    }

    return response;
  }

  async deleteObjects(keys) {
    const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
    const packages = chunk(keys, 1000);

    const { results, errors } = await PromisePool.for(packages)
      .withConcurrency(this.parallelism)
      .process(async (keys) => {
        // Log existence before deletion
        for (const key of keys) {
          const resolvedKey = keyPrefix ? path.join(keyPrefix, key) : key;
          const bucket = this.config.bucket;
          const existsBefore = await this.exists(key);
        }
        const options = {
          Bucket: this.config.bucket,
          Delete: {
            Objects: keys.map((key) => ({
              Key: keyPrefix ? path.join(keyPrefix, key) : key,
            })),
          },
        };

        // Debug log
        let response;
        const [ok, err, res] = await tryFn(() => this.sendCommand(new DeleteObjectsCommand(options)));
        if (!ok) throw err;
        response = res;
          if (response && response.Errors && response.Errors.length > 0) {
            // console.error('[Client][ERROR] DeleteObjectsCommand errors:', response.Errors);
          }
          if (response && response.Deleted && response.Deleted.length !== keys.length) {
            // console.error('[Client][ERROR] Not all objects were deleted:', response.Deleted, 'expected:', keys);
        }
        return response;
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
    const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
    let continuationToken;
    let totalDeleted = 0;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: keyPrefix ? path.join(keyPrefix, prefix || "") : prefix || "",
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
    const [ok, err] = await tryFn(async () => {
      await this.copyObject({ from, to });
      await this.deleteObject(from);
    });
    if (!ok) {
      throw new UnknownError("Unknown error in moveObject", { bucket: this.config.bucket, from, to, original: err });
    }
    return true;
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
    const [ok, err, response] = await tryFn(() => this.sendCommand(new ListObjectsV2Command(options)));
    if (!ok) {
      throw new UnknownError("Unknown error in listObjects", { prefix, bucket: this.config.bucket, original: err });
    }
      this.emit("listObjects", response, options);
      return response;
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
      if (!continuationToken) {
        this.emit("getKeysPage", [], params);
        return [];
      }
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
      if (keys.length >= amount) {
        keys = keys.slice(0, amount);
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
        const [ok, err] = await tryFn(async () => {
          await this.moveObject({ 
            from: key, 
            to,
          });
          });
        if (!ok) {
          throw new UnknownError("Unknown error in moveAllObjects", { bucket: this.config.bucket, from: key, to, original: err });
        }
        return to;
      });
    this.emit("moveAllObjects", { results, errors }, { prefixFrom, prefixTo });
    if (errors.length > 0) {
      throw new UnknownError("Some objects could not be moved", {
        bucket: this.config.bucket,
        operation: 'moveAllObjects',
        prefixFrom,
        prefixTo,
        totalKeys: keys.length,
        failedCount: errors.length,
        successCount: results.length,
        errors: errors.map(e => ({ message: e.message, raw: e.raw })),
        suggestion: 'Check S3 permissions and retry failed objects individually'
      });
    }
    return results;
  }
}

export default Client;