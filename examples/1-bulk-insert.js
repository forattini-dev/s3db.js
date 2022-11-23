const { ENV, CostsPlugin, S3db } = require("./concerns");

const Fakerator = require("fakerator");
const ProgressBar = require("progress");

const TOTAL = 10000;

async function main() {
  const fake = Fakerator();

  const s3db = new S3db({
    uri: ENV.CONNECTION_STRING,
    parallelism: ENV.PARALLELISM,
    passphrase: "super-secret",
    plugins: [CostsPlugin],
  });

  console.log(`creating ${TOTAL} leads.`);
  console.log(`parallelism of ${ENV.PARALLELISM} requests.\n`);

  await s3db.connect();

  const barItem = new ProgressBar(
    "bulk-writing  :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds) [:requests requests]",
    {
      width: 30,
      total: TOTAL,
      incomplete: " ",
    }
  );

  if (!s3db.resources.leads) {
    await s3db.resource(`leads`).define({
      name: "string",
      email: "string",
      token: "secret",
    });
  }

  s3db.on("inserted", () =>
    barItem.tick({ requests: s3db.client.costs.requests.total })
  );

  console.time("bulk-writing");

  await s3db.resource("leads").bulkInsert(
    new Array(TOTAL).fill(0).map((v, k) => ({
      id: k,
      name: fake.names.name(),
      email: fake.internet.email(),
      token: fake.misc.uuid(),
    }))
  );

  console.timeEnd("bulk-writing");
  process.stdout.write("\n\n");
  console.log("Total cost:", s3db.client.costs.total.toFixed(4), "USD");
}

main();
