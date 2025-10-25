import { setupDatabase, teardownDatabase } from './database.js';
import { idGenerator } from '../src/concerns/id.js';
import Fakerator from 'fakerator';
import ProgressBar from 'progress';
import { CostsPlugin } from '../src/plugins/costs.plugin.js';

const TOTAL = 100

async function main() {
  const fake = Fakerator();

  // Setup database with CostsPlugin to track operations
  const s3db = await setupDatabase({
    plugins: [new CostsPlugin()]
  });

  console.log(`creating ${TOTAL} leads.`);
  console.log(`parallelism of ${s3db.config.parallelism || 10} requests.\n`);

  const barItem = new ProgressBar(
    "bulk-writing  :current/:total (:percent)  [:bar]  :rate/bps  :etas (:elapseds) [:requests requests]",
    {
      width: 30,
      total: TOTAL,
      incomplete: " ",
    }
  );

  if (!s3db.resources.leads) {
    await s3db.createResource({
      name: "leads",
      attributes: {
        name: "string",
        email: "string",
        token: "secret",
      },
    });
  }

  s3db.on("inserted", () =>
    barItem.tick({ requests: s3db.client.costs.requests.total })
  );

  console.time("bulk-writing");

  await s3db.resources.leads.insertMany(
    new Array(TOTAL).fill(0).map((v, k) => ({
      id: k,
      name: fake.names.name(),
      email: fake.internet.email(),
      token: idGenerator(),
    }))
  );

  console.timeEnd("bulk-writing");
  process.stdout.write("\n\n");
  console.log("Total cost:", s3db.client.costs.total.toFixed(4), "USD");
  
  await teardownDatabase();
}

main();