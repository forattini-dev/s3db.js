import * as dotenv from "dotenv";

dotenv.config();
jest.setTimeout(30 * 1000);

import S3db from "../src";

const {
  bucket = "",
  accessKeyId = "",
  secretAccessKey = "",
} = process.env;

const bucketPrefix =  "databases/test-config-" + Date.now()

function ClientFactory() {
  return new S3db({
    uri: `s3://${accessKeyId}:${secretAccessKey}@${bucket}/${bucketPrefix}`,
  });
}

describe("static config", function () {
  let s3db = ClientFactory();

  it("constructor definitions", async function () {
    expect(s3db.client.bucket).toBe(bucket);
    expect(s3db.client.keyPrefix).toBe(bucketPrefix);
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
