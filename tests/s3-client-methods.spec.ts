import { ConnectionString } from "./concerns";
import { S3Client } from "../src";
import { ClientNoSuchKey } from "../src/errors";

describe("client methods", function () {
  it("putObject and getObject and headObject and deleteObject", async function () {
    const client = new S3Client({
      connectionString: ConnectionString("s3-client-methods-1"),
    });

    const params = {
      key: "testfile.csv",
      metadata: {
        a: "1",
        b: "2",
        c: "3",
      },
    };

    await client.putObject(params);

    const objGet = await client.getObject(params.key);

    expect(objGet).toBeDefined();

    if (objGet && objGet.Metadata) {
      expect(objGet.Metadata.a).toEqual(params.metadata.a);
      expect(objGet.Metadata.b).toEqual(params.metadata.b);
      expect(objGet.Metadata.c).toEqual(params.metadata.c);
    } else {
      throw new Error("missing metadata");
    }

    const objHead = await client.headObject(params.key);

    expect(objHead).toBeDefined();

    if (objHead && objHead.Metadata) {
      expect(objHead.Metadata.a).toEqual(params.metadata.a);
      expect(objHead.Metadata.b).toEqual(params.metadata.b);
      expect(objHead.Metadata.c).toEqual(params.metadata.c);
    } else {
      throw new Error("missing metadata");
    }

    await client.deleteObject(params.key);

    try {
      await client.headObject(params.key);
    } catch (error) {
      expect(error instanceof ClientNoSuchKey).toEqual(true)      
    }

    try {
      await client.deleteObject(params.key);
    } catch (error) {
      expect(error instanceof ClientNoSuchKey).toEqual(true)      
    }
  });

  it("listObjects and getAllKeys and count and deleteObjects", async function () {
    const client = new S3Client({
      connectionString: ConnectionString("s3-client-methods-2"),
    });

    const createObj = (_: any, k: number) => ({
      key: `testfile.part${String(k)}.csv`,
    });

    const objs = new Array(10).fill(0).map(createObj)

    const proms = objs.map((p)=> client.putObject(p))
    await Promise.all(proms)

    const objsLive = await client.listObjects()
    const { Contents } = objsLive

    expect(objs.length).toEqual(Contents?.length)

    const objsKeys = await client.getAllKeys()
    expect(objs.length).toEqual(objsKeys.length)

    const count = await client.count()
    expect(objs.length).toEqual(count)

    await client.deleteObjects(objs.map(o => o.key))

    const count2 = await client.count()
    expect(count2).toEqual(0)
  });
});
