const { ENV, S3db, CostsPlugin } = require("./concerns");

const Multiprogress = require("multi-progress");
const { pipeline } = require("stream");

async function main() {
  const s3db = new S3db({
    uri: ENV.CONNECTION_STRING,
    passphrase: ENV.PASSPRHASE,
    parallelism: ENV.PARALLELISM,
    plugins: [CostsPlugin],
  });

  await s3db.connect();

  if (!s3db.resources.copyLeads) {
    await s3db.createResource({
      name: "copy-leads",
      attributes: {
        name: "string",
        email: "string",
        token: "secret",
      },
    });
  }

  const total = await s3db.resource("leads").count();

  console.log(`reading ${total} leads.`);
  console.log(`parallelism of ${ENV.PARALLELISM} requests.\n`);

  const multi = new Multiprogress(process.stdout);
  const options = {
    total,
    width: 30,
    incomplete: " ",
  };

  const requestsBar = multi.newBar(
    "requests        :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds)",
    {
      ...options,
      total: 1,
    }
  );

  const readPages = multi.newBar(
    "reading-pages   :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds)",
    {
      ...options,
      total: 1,
    }
  );

  const readIds = multi.newBar(
    "reading-ids     :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds)",
    options
  );

  const readData = multi.newBar(
    "reading-data    :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds)",
    options
  );

  const writeIds = multi.newBar(
    "writing-ids     :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds)",
    options
  );

  const writeData = multi.newBar(
    "writing-data    :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds)",
    options
  );

  const readStream = s3db.resource("leads").readable();
  const writeStream = s3db.resource("copy-leads").writable();

  console.time("copying-data");
  s3db.client.on("request", () => requestsBar.tick());

  readStream.on("page", () => readPages.tick());
  readStream.on("id", () => readIds.tick());
  readStream.on("data", () => readData.tick());

  writeStream.on("id", () => writeIds.tick());
  writeStream.on("data", () => writeData.tick());

  writeStream.on("end", () => {
    process.stdout.write("\n");
    console.timeEnd("copying-data");
    process.stdout.write("\n\n");
    console.log("Total cost:", s3db.client.costs.total.toFixed(4), "USD");
  });

  pipeline(readStream, writeStream, (err) => console.error(err));
}

main();