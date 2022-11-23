import * as path from "path";
import { S3 } from "aws-sdk";
import { Readable } from "node:stream";
import { PromisePool } from "@supercharge/promise-pool";

import Resource from "../resource.class";
import S3Client from "../s3-client.class";
import { chunk } from "lodash";

export default class ResourceIdsReadStream extends Readable {
  resource: Resource;
  finishedReadingResource: boolean;
  content: any[];
  loading: Promise<void> | null;
  pagesCount: number;

  constructor({ resource }: { resource: Resource }) {
    super({
      objectMode: true,
      highWaterMark: resource.client.parallelism,
    });

    this.resource = resource;
    this.pagesCount = 0;
    this.content = [];
    this.finishedReadingResource = false;
    this.loading = this.getItems();
  }

  async _read(size: number): Promise<void> {
    if (this.content.length === 0) {
      if (this.loading) {
        await this.loading;
      } else if (this.finishedReadingResource) {
        this.push(null);
        return;
      }
    }

    const data = this.content.shift();
    this.push(data);
  }

  async getItems({
    continuationToken = null,
  }: {
    continuationToken?: string | null;
  } = {}) {
    this.emit("page", this.pagesCount++);

    const res: S3.ListObjectsV2Output = await this.resource.client.listObjects({
      prefix: `resource=${this.resource.name}`,
      continuationToken,
    });

    if (res.Contents) {
      const contents = chunk(res.Contents, this.resource.client.parallelism);

      await PromisePool.for(contents)
        .withConcurrency(5)
        .handleError(async (error, content) => {
          this.emit("error", error, content);
        })
        .process((pkg: any[]) => {
          const ids = pkg.map((obj) => {
            return (obj.Key || "").replace(
              path.join(
                this.resource.client.keyPrefix,
                `resource=${this.resource.name}`,
                "id="
              ),
              ""
            );
          });

          this.content.push(ids);
          ids.forEach((id: string) => this.emit("id", this.resource.name, id));
        });
    }

    this.finishedReadingResource = !res.IsTruncated;

    if (res.NextContinuationToken) {
      this.loading = this.getItems({
        continuationToken: res.NextContinuationToken,
      });
    } else {
      this.loading = null;
    }
  }
}
