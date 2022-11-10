require("dotenv").config({ path: `${__dirname}/../.env` });

const { v4: uuid } = require("uuid");
const ProgressBar = require("progress");

const { S3db } = require("../build");

const { bucket, accessKeyId, secretAccessKey } = process.env;

const TOTAL = 10000;
const PARALLELISM = 100;

async function main() {
  const client = new S3db({
    parallelism: PARALLELISM,
    passphrase: "super-secret",
    uri: `s3://${accessKeyId}:${secretAccessKey}@${bucket}/databases/ex-${new Date()
    .toISOString()
    .substring(0, 10)}`,
  });
  
  console.log(`creating ${TOTAL} leads.`)
  console.log(`parallelism of ${PARALLELISM} requests.\n`)

  const bar = new ProgressBar(
    "bulk-writing  :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds)",
    {
      width: 30,
      total: TOTAL,
      incomplete: " ",
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
  process.stdout.write('\n\n')
}

main();
