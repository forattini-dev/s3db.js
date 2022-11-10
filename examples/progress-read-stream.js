require("dotenv").config({ path: `${__dirname}/../.env` });

const fs = require('fs')
const ProgressBar = require("progress");

const { S3db } = require("../build");

const { bucket, accessKeyId, secretAccessKey } = process.env;
const PRARALLELISM = 25;

async function main() {
  const client = new S3db({
    uri: `s3://${accessKeyId}:${secretAccessKey}@${bucket}/databases/ex-${new Date()
    .toISOString()
    .substring(0, 10)}`,
    parallelism: PRARALLELISM,
  });

  await client.connect();
  const count = await client.resource("leads").count();
  
  const bar = new ProgressBar(
    "reading  :current/:total (:percent)  [:bar]  :rate/bps  :etas",
    {
      complete: "=",
      incomplete: " ",
      width: 20,
      total: count,
    }
  );
  
  const stream = await client.resource("leads").stream();
  const streamWrite = fs.createWriteStream(__dirname+'/out'+Date.now()+'.txt')

  console.time('reading')
  stream.on("data", () => bar.tick());
  stream.on("data", (data) => streamWrite.write(`${JSON.stringify(data)}\n`));
  stream.on("end", () => console.timeEnd('reading'))
}

main();
