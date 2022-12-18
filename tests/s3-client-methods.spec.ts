import { ConnectionString } from "./concerns";

import { padStart } from "lodash";

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
      expect(error instanceof ClientNoSuchKey).toEqual(true);
    }

    try {
      await client.deleteObject(params.key);
    } catch (error) {
      expect(error instanceof ClientNoSuchKey).toEqual(true);
    }
  });

  it("listObjects and getAllKeys and count and deleteObjects", async function () {
    const client = new S3Client({
      connectionString: ConnectionString("s3-client-methods-2"),
    });

    const createObj = (_: any, k: number) => ({
      key: `testfile.part${String(k)}.csv`,
    });

    const objs = new Array(10).fill(0).map(createObj);

    const proms = objs.map((p) => client.putObject(p));
    await Promise.all(proms);

    const objsLive = await client.listObjects();
    const { Contents } = objsLive;

    expect(objs.length).toEqual(Contents?.length);

    const objsKeys = await client.getAllKeys();
    expect(objs.length).toEqual(objsKeys.length);

    const count = await client.count();
    expect(objs.length).toEqual(count);

    await client.deleteObjects(objs.map((o) => o.key));

    const count2 = await client.count();
    expect(count2).toEqual(0);
  });

  it("easy offset", async function () {
    const client = new S3Client({
      connectionString: ConnectionString("s3-client-methods-3"),
    });

    const total = await client.count();
    if (total < 100) {
      const createObj = (_: any, k: number) => ({
        key: `testfile.part${padStart(String(k), 4, "0")}.csv`,
      });

      const objs = new Array(100).fill(0).map(createObj);
      const proms = objs.map((p) => client.putObject(p));
      await Promise.all(proms);
    }

    const [p1, p2, p3] = await Promise.all([
      client.getKeysPage({ offset: 0, amount: 10 }),
      client.getKeysPage({ offset: 10, amount: 10 }),
      client.getKeysPage({ offset: 20, amount: 10 }),
    ]);

    expect(p1[0]).toEqual(`testfile.part0000.csv`);
    expect(p1[1]).toEqual(`testfile.part0001.csv`);
    expect(p1.length).toEqual(10);

    expect(p2[0]).toEqual(`testfile.part0010.csv`);
    expect(p2[1]).toEqual(`testfile.part0011.csv`);
    expect(p2.length).toEqual(10);

    expect(p3[0]).toEqual(`testfile.part0020.csv`);
    expect(p3[1]).toEqual(`testfile.part0021.csv`);
    expect(p3.length).toEqual(10);
  });

  it("medium offset", async function () {
    const client = new S3Client({
      connectionString: ConnectionString("s3-client-methods-4"),
    });

    const total = await client.count();
    if (total < 2225) {
      const createObj = (_: any, k: number) => ({
        key: `testfile.part${padStart(String(k), 4, "0")}.csv`,
      });

      const objs = new Array(2500).fill(0).map(createObj);
      const proms = objs.map((p) => client.putObject(p));
      await Promise.all(proms);
    }

    const [p1, p2, p3] = await Promise.all([
      client.getKeysPage({ offset: 0, amount: 750 }),
      client.getKeysPage({ offset: 750, amount: 750 }),
      client.getKeysPage({ offset: 1500, amount: 750 }),
    ]);

    expect(p1[0]).toEqual(`testfile.part0000.csv`);
    expect(p1[1]).toEqual(`testfile.part0001.csv`);
    expect(p1.length).toEqual(750);

    expect(p2[0]).toEqual(`testfile.part0750.csv`);
    expect(p2[1]).toEqual(`testfile.part0751.csv`);
    expect(p2.length).toEqual(750);

    expect(p3[0]).toEqual(`testfile.part1500.csv`);
    expect(p3[1]).toEqual(`testfile.part1501.csv`);
    expect(p3.length).toEqual(750);
  });

  it("hard offset", async function () {
    const client = new S3Client({
      connectionString: ConnectionString("s3-client-methods-5"),
    });

    const total = await client.count();
    if (total < 4800) {
      const createObj = (_: any, k: number) => ({
        key: `testfile.part${padStart(String(k), 4, "0")}.csv`,
      });

      const objs = new Array(4800).fill(0).map(createObj);
      const proms = objs.map((p) => client.putObject(p));
      await Promise.all(proms);
    }

    const [p1, p2, p3] = await Promise.all([
      client.getKeysPage({ offset: 0, amount: 1600 }),
      client.getKeysPage({ offset: 1600, amount: 1600 }),
      client.getKeysPage({ offset: 3200, amount: 1600 }),
    ]);

    expect(p1[0]).toEqual(`testfile.part0000.csv`);
    expect(p1[1]).toEqual(`testfile.part0001.csv`);
    expect(p1.length).toEqual(1600);

    expect(p2[0]).toEqual(`testfile.part1600.csv`);
    expect(p2[1]).toEqual(`testfile.part1601.csv`);
    expect(p2.length).toEqual(1600);

    expect(p3[0]).toEqual(`testfile.part3200.csv`);
    expect(p3[1]).toEqual(`testfile.part3201.csv`);
    expect(p3.length).toEqual(1600);
  });
});
