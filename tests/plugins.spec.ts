import { ConnectionString } from "./concerns";
import { S3db, CostsPlugin } from "../src";

describe("plugins", function () {
  it("costs plugin should be installed", async function () {
    const plugin = CostsPlugin;
    expect(plugin.hasOwnProperty('started')).toEqual(false);

    const s3db = new S3db({
      plugins: [plugin],
      uri: ConnectionString("s3-database"),
    });

    expect(s3db.plugins.length).toEqual(1);
    expect(s3db.client.hasOwnProperty("costs")).toEqual(true);

    expect(plugin.hasOwnProperty('client')).toEqual(true);
    expect(plugin.hasOwnProperty('started')).toEqual(true);
  });
});
