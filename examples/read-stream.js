require("dotenv").config({ path: `${__dirname}/../.env` });

const Multiprogress = require("multi-progress");

const { S3db } = require("../build");

const { bucket, accessKeyId, secretAccessKey } = process.env;

const PARALLELISM = 100;
const CONNECTION_STRING =
  `s3://${accessKeyId}:${secretAccessKey}@${bucket}/databases/examples-` +
  new Date().toISOString().substring(0, 10);

async function main() {
  const client = new S3db({
    uri: CONNECTION_STRING,
    parallelism: PARALLELISM,
  });

  await client.connect();
  const total = await client.resource("leads").count();

  console.log(`reading ${total} leads.`);
  console.log(`parallelism of ${PARALLELISM} requests.\n`);
  const multi = new Multiprogress(process.stdout);

  const options = {
    total,
    width: 30,
    incomplete: " ",
  };

  const barIds = multi.newBar(
    "reading-ids   :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds)",
    options
  );

  const barData = multi.newBar(
    "reading-data  :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds)",
    options
  );

  const stream = await client.resource("leads").stream();

  console.time("reading");
  stream.on("id", () => barIds.tick());
  stream.on("data", () => barData.tick());
  stream.on("end", () => {
    console.timeEnd("reading");
    process.stdout.write("\n\n");
  });
}

main();