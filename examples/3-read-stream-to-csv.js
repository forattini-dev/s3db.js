const { ENV, S3db } = require("./concerns");

const fs = require("fs");
const ProgressBar = require("progress");
const { Transform } = require("stream");

async function main() {
  const s3db = new S3db({
    uri: ENV.CONNECTION_STRING,
    passphrase: ENV.PASSPRHASE,
    parallelism: ENV.PARALLELISM,
  });

  await s3db.connect();
  const total = await s3db.resource("leads").count();

  console.log(`reading ${total} leads.`);
  console.log(`parallelism of ${ENV.PARALLELISM} requests.\n`);

  const barData = new ProgressBar(
    "reading-data  :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds)",
    {
      total,
      width: 30,
      incomplete: " ",
    }
  );

  const filename = __dirname + "/tmp/leads." + Date.now() + ".csv";

  const stream = await s3db.resource("leads").readable();
  const streamWrite = fs.createWriteStream(filename);

  const transformer = new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      this.push(
        [chunk.id, chunk._createdAt, chunk.email, chunk.name, chunk.token].join(";") + "\n"
      );
      callback();
    },
  });

  console.time("reading-data");
  stream.on("data", () => barData.tick());

  stream.on("end", () => {
    console.timeEnd("reading-data");
    process.stdout.write("\n");
    const { size } = fs.statSync(filename);
    console.log(`\nTotal size: ${(size / (1024 * 1000)).toFixed(2)} Mb`);
  });

  stream.pipe(transformer).pipe(streamWrite);
}

main();