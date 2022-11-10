require("dotenv").config({ path: `${__dirname}/../.env` });

const fs = require('fs')
const ProgressBar = require('progress');
const { Transform } = require("stream");

const { S3db } = require("../build");

const { bucket, accessKeyId, secretAccessKey } = process.env;
const PARALLELISM = 100;

async function main() {
  const client = new S3db({
    parallelism: PARALLELISM,
    uri: `s3://${accessKeyId}:${secretAccessKey}@${bucket}/databases/ex-${new Date()
    .toISOString()
    .substring(0, 10)}`,
  });

  await client.connect();
  const total = await client.resource("leads").count();
  
  const barData = new ProgressBar(
    "reading data  :current/:total (:percent)  [:bar]  :rate/bps  :etas",
    {
      total,
      width: 30,
      incomplete: " ",
    }
  );
  
  const stream = await client.resource("leads").stream();
  const streamWrite = fs.createWriteStream(__dirname+'/tmp/leads.'+Date.now()+'.csv')

  const transformer = new Transform({
    objectMode: true,
    transform (chunk, encoding, callback) {
      this.push([chunk.id, chunk.name, chunk.token].join(";") + "\n");
      callback();
    }
  })

  stream
    .pipe(transformer)
    .pipe(streamWrite)

  console.time('reading')

  stream.on("data", () => barData.tick());
  stream.on("end", () => {
    console.timeEnd('reading')
    process.stdout.write('\n\n')
  })
}

main();