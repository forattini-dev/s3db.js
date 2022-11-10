require("dotenv").config({ path: `${__dirname}/../.env` });

const { v4: uuid } = require("uuid");
const ProgressBar = require("progress");

const { S3db } = require("../build");

const { bucket, accessKeyId, secretAccessKey } = process.env;

const TOTAL = 10000;
const PARALLELISM = 50;

async function main() {
  const client = new S3db({
    uri: `s3://${accessKeyId}:${secretAccessKey}@${bucket}/databases/ex-${new Date()
      .toISOString()
      .substring(0, 10)}`,
    parallelism: PARALLELISM,
    passphrase: "super-secret",
  });

  const bar = new ProgressBar(
    "bulk-writing  :current/:total (:percent)  [:bar]  :rate/bps  :etas",
    {
      complete: "=",
      incomplete: " ",
      width: 30,
      total: TOTAL,
    }
  );

  await client.connect();

  if (!client.metadata.resources.leads) {
    await client.newResource({
      resourceName: `leads`,
      attributes: {
        name: "string",
        token: "secret",
      },
    });
  }

  client.on("inserted", () => bar.tick());

  console.time('bulk-writing')

  await client.resource("leads").bulkInsert(
    new Array(TOTAL).fill(0).map((v, k) => ({
      id: k,
      name: `Lead #${k}`,
      token: uuid(),
    }))
  );

  console.timeEnd('bulk-writing')
}

main();
