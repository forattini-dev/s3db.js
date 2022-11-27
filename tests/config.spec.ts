import { ENV } from "./concerns";

import S3db from "../src";

function ClientFactory() {
  return new S3db({
    uri: ENV.CONNECTION_STRING('config'),
  });
}

describe("static config", function () {
  it("constructor definitions", async function () {
    const s3db = ClientFactory();
    const uri = new URL(ENV.CONNECTION_STRING('config'));

    expect(s3db.client.bucket).toBe(uri.hostname);
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
