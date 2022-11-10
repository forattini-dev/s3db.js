import * as path from "path";
import { Readable } from "node:stream";
import { PromisePool } from "@supercharge/promise-pool";

import S3db from "./s3db.class";
import S3Client from "./s3-client.class";
import { S3 } from "aws-sdk";

export class ReadResourceStream extends Readable {
  s3db: S3db;
  client: S3Client;
  resourceName: string;
  continuationToken: null | string;
  finishedReadingBucked: boolean;
  content: any[];
  loading: Promise<void> | null;
  parallelism: number;

  constructor({
    s3db,
    client,
    resourceName,
    parallelism = 10,
  }: {
    s3db: S3db;
    client: S3Client;
    resourceName: string;
    parallelism?: number;
  }) {
    super({
      objectMode: true,
    });

    this.s3db = s3db;
    this.client = client;

    this.resourceName = resourceName;
    this.continuationToken = null;
    this.finishedReadingBucked = false;
    this.content = [];
    this.parallelism = parallelism;

    this.loading = this.getItems();
  }

  async _read(size: number): Promise<void> {
    if (this.content.length === 0) {
      if (this.loading) {
        await this.loading;
      } else if (this.finishedReadingBucked) {
        this.push(null);
        return;
      }
    }

    const data = this.content.shift();
    this.push(data);
  }

  async getItems() {
    const res: S3.ListObjectsV2Output = await this.client.listObjects({
      prefix: `resource=${this.resourceName}`,
      continuationToken: this.continuationToken,
      maxKeys: (this.parallelism * 4) % 1000,
    });

    if (res.Contents) {
      await PromisePool.for(res.Contents)
        .withConcurrency(this.parallelism)
        .handleError(async (error, content) => {
          this.emit("error", error, content);
        })
        .process((x: any) => this.addItem(x));
    }

    this.finishedReadingBucked = !res.IsTruncated;

    if (res.NextContinuationToken) {
      this.continuationToken = res.NextContinuationToken;
      this.loading = this.getItems();
    } else {
      this.loading = null;
    }
  }

  async addItem(obj: any) {
    let id = (obj.Key || "").replace(
      path.join(this.client.keyPrefix, `resource=${this.resourceName}`, "id="),
      ""
    );

    this.emit('id', this.resourceName, id)

    const data = await this.s3db.getById({
      resourceName: this.resourceName,
      id,
    });

    this.content.push(data);
  }
}

export default class S3Streamer {
  s3db: S3db;
  client: S3Client;
  parallelism: number;

  constructor({
    s3db,
    client,
    parallelism,
  }: {
    s3db: S3db;
    client: S3Client;
    parallelism: number;
  }) {
    this.s3db = s3db;
    this.client = client;
    this.parallelism = parallelism;
  }

  async resourceRead({ resourceName }: { resourceName: string }) {
    const input = new ReadResourceStream({
      s3db: this.s3db,
      client: this.client,
      resourceName,
      parallelism: this.parallelism,
    });

    return input;
  }
}
