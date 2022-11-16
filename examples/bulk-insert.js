require("dotenv").config({ path: `${__dirname}/../.env` });

const Fakerator = require("fakerator");
const ProgressBar = require("progress");

const { S3db } = require("../build");

const { bucket, accessKeyId, secretAccessKey } = process.env;

const TOTAL = 10000;
const PARALLELISM = 100;

const CONNECTION_STRING =
  `s3://${accessKeyId}:${secretAccessKey}@${bucket}/databases/examples-` +
  new Date().toISOString().substring(0, 10);

async function main() {
  const fake = Fakerator();

  const client = new S3db({
    uri: CONNECTION_STRING,
    parallelism: PARALLELISM,
    passphrase: "super-secret",
  });

  console.log(`creating ${TOTAL} leads.`);
  console.log(`parallelism of ${PARALLELISM} requests.\n`);

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
        email: "string",
        token: "secret",
      },
    });
  }

  client.on("inserted", () => bar.tick());

  console.time("bulk-writing");

  await client.resource("leads").bulkInsert(
    new Array(TOTAL)
      .fill(0)
      .map((v, k) => ({
        id: k,
        name: fake.names.name(),
        email: fake.internet.email(),
        token: fake.misc.uuid(),
      }))
  );

  console.timeEnd("bulk-writing");
  process.stdout.write("\n\n");
}

main();
