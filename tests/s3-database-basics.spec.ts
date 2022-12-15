import { ConnectionString } from "./concerns";
import { S3db } from "../src";

describe("database basics", function () {
  it("default config", async function () {
    const options = {
      cache: false,
      parallelism: 10,
      passphrase: 'secret',
      uri: ConnectionString("s3-database") ,
    }
    
    const s3db = new S3db(options);
    expect(s3db.options).toEqual(options);

    expect(s3db.resources).toEqual({});
    expect(s3db.plugins.length).toEqual(0);
    expect(s3db.cache).toEqual(options.cache);
    expect(s3db.passphrase).toEqual(options.passphrase);
    expect(s3db.parallelism).toEqual(options.parallelism);
  });
});
