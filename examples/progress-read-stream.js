require("dotenv").config({ path: `${__dirname}/../.env` });

const fs = require('fs')
const Multiprogress = require('multi-progress')

const { S3db } = require("../build");

const { bucket, accessKeyId, secretAccessKey } = process.env;
const PARALLELISM = 50;

async function main() {
  const client = new S3db({
    uri: `s3://${accessKeyId}:${secretAccessKey}@${bucket}/databases/ex-${new Date()
    .toISOString()
    .substring(0, 10)}`,
    parallelism: PARALLELISM,
  });

  await client.connect();
  const total = await client.resource("leads").count();
  
  const multi = new Multiprogress(process.stdout)

  const barIds = multi.newBar(
    "reading ids   :current/:total (:percent)  [:bar]  :rate/bps  :etas",
    {
      complete: "=",
      incomplete: " ",
      width: 20,
      total,
    }
  );

  const barData = multi.newBar(
    "reading data  :current/:total (:percent)  [:bar]  :rate/bps  :etas",
    {
      complete: "=",
      incomplete: " ",
      width: 20,
      total,
    }
  );
  
  const stream = await client.resource("leads").stream();
  const streamWrite = fs.createWriteStream(__dirname+'/out'+Date.now()+'.txt')

  console.time('reading')
  stream.on("id", () => barIds.tick());
  stream.on("data", () => barData.tick());
  stream.on("data", (data) => streamWrite.write(`${JSON.stringify(data)}\n`));
  stream.on("end", () => console.timeEnd('reading'))
}

main();
