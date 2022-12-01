const { ENV, CostsPlugin, S3db } = require("./concerns");

const Multiprogress = require("multi-progress");

async function main() {
  const s3db = new S3db({
    uri: ENV.CONNECTION_STRING,
    passphrase: ENV.PASSPRHASE,
    parallelism: ENV.PARALLELISM,
    plugins: [CostsPlugin],
  });
  
  await s3db.connect();
  const total = await s3db.resource("leads").count();

  console.log(`reading ${total} leads.`);
  console.log(`parallelism of ${ENV.PARALLELISM} requests.\n`);
  
  const multi = new Multiprogress(process.stdout);
  const options = {
    total,
    width: 30,
    incomplete: " ",
  };

  const barPages = multi.newBar(
    "reading-pages   :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds)",
    {
      ...options,
      total: 1,
    }
  );

  const barIds = multi.newBar(
    "reading-ids     :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds)",
    options
  );

  const barData = multi.newBar(
    "reading-data    :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds)",
    options
  );

  const stream = s3db.resource("leads").readable();

  console.time("reading");

  stream.on("page", () => barPages.tick());
  stream.on("id", () => barIds.tick());
  stream.on("data", () => barData.tick());
  stream.on("error", (err) => console.error(err));

  stream.on("end", () => {
    process.stdout.write("\n");
    console.timeEnd("reading");
    process.stdout.write("\n\n");
    console.log("Total cost:", s3db.client.costs.total.toFixed(4), "USD");
  });
}

main();
