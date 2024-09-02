import path from "path";
import { chunk } from "lodash-es";
import { Readable } from "node:stream";
import { PromisePool } from "@supercharge/promise-pool";

class ResourceIdsReadStream extends Readable {
  constructor({ resource }) {
    super({
      objectMode: true,
      highWaterMark: resource.s3Client.parallelism * 3,
    });

    this.resource = resource;
    this.pagesCount = 0;
    this.content = [];
    this.finishedReadingResource = false;
    this.loading = this.getItems();
  }

  async _read(size) {
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

  async getItems({ continuationToken = null } = {}) {
    this.emit("page", this.pagesCount++);

    const res = await this.resource.s3Client.listObjects({
      prefix: `resource=${this.resource.name}`,
      continuationToken,
    });

    if (res.Contents) {
      const contents = chunk(res.Contents, this.resource.s3Client.parallelism);

      await PromisePool.for(contents)
        .withConcurrency(5)
        .handleError(async (error, content) => {
          this.emit("error", error, content);
        })
        .process((pkg) => {
          const ids = pkg.map((obj) => {
            return (obj.Key || "").replace(
              path.join(
                this.resource.s3Client.keyPrefix,
                `resource=${this.resource.name}`,
                "id="
              ),
              ""
            );
          });

          this.content.push(ids);
          ids.forEach((id) => this.emit("id", id));
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

export default ResourceIdsReadStream;
