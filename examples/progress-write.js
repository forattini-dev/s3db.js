require("dotenv").config({ path: `${__dirname}/../.env` });

const { v4: uuid } = require("uuid");
const ProgressBar = require("progress");

const { S3db } = require("../build");

const { 
  bucket, 
  accessKeyId,
  secretAccessKey
} = process.env;

async function main() {
  const client = new S3db({
    uri: `s3://${accessKeyId}:${secretAccessKey}@${bucket}/databases/ex1-${Date.now()}`,
    passphrase: "super-secret",
  });

  const bar = new ProgressBar("  uploading [:bar] :rate/bps :percent :etas", {
    complete: "=",
    incomplete: " ",
    width: 20,
    total: 100,
  });

  client.connect();

  client.on("data", () => bar.tick());

  client.on("connected", async () => {
    await client.newResource({
      resourceName: `leads`,
      attributes: {
        name: "string",
        token: "secret"
      },
    });

    await client.resource("leads").bulkInsert(
      new Array(100).fill(0).map((v, k) => ({
        id: k,
        name: `Lead #${k}`,
        token: uuid(),
      }))
    );
  });
}

main();
