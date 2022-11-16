require("dotenv").config({ path: `${__dirname}/../.env` });

const fs = require("fs");
const ProgressBar = require("progress");
const { Transform } = require("stream");

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

  console.log(`parallelism of ${PARALLELISM} requests.\n`);
  const barData = new ProgressBar(
    "reading-data  :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds)",
    {
      total,
      width: 30,
      incomplete: " ",
    }
  );

  const filename = __dirname + "/tmp/leads." + Date.now() + ".csv";

  const stream = await client.resource("leads").stream();
  const streamWrite = fs.createWriteStream(filename);

  const transformer = new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      this.push(
        [chunk.id, chunk.email, chunk.name, chunk.token].join(";") + "\n"
      );
      callback();
    },
  });

  console.time("reading-data");

  stream.on("data", () => barData.tick());
  stream.on("end", () => {
    console.timeEnd("reading-data");
    const { size } = fs.statSync(filename);
    console.log(
      `\nresource leads total size: ${(size / (1024 * 1000)).toFixed(2)} Mb`
    );
    process.stdout.write("\n\n");
  });

  stream.pipe(transformer).pipe(streamWrite);
}

main();
