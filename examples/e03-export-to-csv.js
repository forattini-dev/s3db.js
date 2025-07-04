import { setupDatabase, teardownDatabase } from './database.js';
import { ENV, S3db } from './concerns.js';
import fs from 'fs';
import ProgressBar from 'progress';
import { Transform } from 'stream';

async function main() {
  const s3db = await setupDatabase();
  
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
  
  await teardownDatabase();
}

main();