import { ENV } from "./concerns";

import { S3db } from "../src";

function S3dbFactory() {
  return new S3db({
    uri: ENV.CONNECTION_STRING("config"),
  });
}

describe("static config", function () {
  it("constructor definitions", async function () {
    const s3db = S3dbFactory();
    const uri = new URL(ENV.CONNECTION_STRING("config"));

    expect(s3db.client.bucket).toBe(uri.hostname);
  });
});

describe("start", function () {
  let s3db = S3dbFactory();

  it("setup", async function () {
    await s3db.connect();

    expect(s3db.version).toBeDefined();
    expect(s3db.resources).toBeDefined();
  });
});
