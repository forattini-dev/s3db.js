import * as dotenv from "dotenv";

dotenv.config();
jasmine.DEFAULT_TIMEOUT_INTERVAL = 15 * 1000;

import S3db from "../src";

const {
  bucket = "",
  accessKeyId = "",
  secretAccessKey = "",
} = process.env;

const bucketPrefix =  "databases/test-" + Date.now()

function ClientFactory() {
  return new S3db({
    uri: `s3://${accessKeyId}:${secretAccessKey}@${bucket}/${bucketPrefix}`,
  });
}

describe("static config", function () {
  let client = ClientFactory();

  it("constructor definitions", async function () {
    expect(client.bucket).toBe(bucket);
    expect(client.keyPrefix).toBe(bucketPrefix);
  });
});

describe("start", function () {
  let client = ClientFactory();

  it("setup", async function () {
    await client.connect()

    expect(client.metadata).toBeDefined();
    expect(client.metadata?.version).toBeDefined();
    expect(client.metadata?.resources).toBeDefined();
  });
});
