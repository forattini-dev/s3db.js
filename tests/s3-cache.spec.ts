import { ENV, ConnectionString } from "./concerns";

import Fakerator from "fakerator";

import { S3Client } from "../src/s3-client.class";
import { S3Database } from "../src/s3-database.class";
import { S3Resource } from "../src/s3-resource.class";
import { S3Cache } from "../src/cache/s3-cache.class";
import { Serializers } from "../src/cache/serializers.type";

const fake = Fakerator();

const COMPRESS_OPTIONS = [false, true];

const SERIALIZERS_OPTIONS = [
  Serializers.json,
  // Serializers.avro,
];

const SIZES_OPTIONS = {
  small: () => fake.lorem.sentence(),

  medium: () =>
    new Array(2 ** 4)
      .fill(0)
      .map(() => fake.lorem.paragraph())
      .join(" "),

  large: () =>
    new Array(2 ** 8)
      .fill(0)
      .map(() => fake.lorem.paragraph())
      .join(" "),
};

const mapIds = (res: any[]) => res.map((r) => r.id).sort();

describe("s3Cache", function () {
  const s3Client = new S3Client({
    connectionString: ConnectionString("s3-cache"),
  });

  it("constructor definitions", async function () {
    const s3Cache = new S3Cache({
      s3Client,
      compressData: true,
      serializer: Serializers.json,
    });

    const key = s3Cache.getKey({
      params: {
        a: 1,
        b: 2,
        c: 3,
      },
    });

    expect(key).toContain("cache/");
    expect(key).toContain(Serializers.json);
    expect(key).toContain(".gz");
  });

  for (const serializer of SERIALIZERS_OPTIONS) {
    for (const compressData of COMPRESS_OPTIONS) {
      for (const sizeDefinition of Object.entries(SIZES_OPTIONS)) {
        describe(`${serializer} serializer`, () => {
          describe(compressData ? "compressed" : `not compressed`, () => {
            const [sizeName, sizeFn] = sizeDefinition;
            const data = sizeFn();

            const s3Cache = new S3Cache({
              s3Client,
              compressData,
              serializer: Serializers[serializer],
            });

            it(`put ${sizeName} cache`, async function () {
              await s3Cache._put({
                data,
                key: s3Cache.getKey({
                  params: { sizeName, serializer, compressData },
                }),
              });

              const resData = await s3Cache._get({
                key: s3Cache.getKey({
                  params: { sizeName, serializer, compressData },
                }),
              });

              expect(resData).toBe(data);
              expect(resData.length).toBe(data.length);

              const isDeleted = await s3Cache._delete({
                key: s3Cache.getKey({
                  params: { sizeName, serializer, compressData },
                }),
              });

              expect(isDeleted).toBe(true);
            });
          });
        });
      }
    }
  }

  describe("s3db with cache", () => {
    const s3db = new S3Database({
      uri: ConnectionString("db-cached"),
      cache: true,
    });

    beforeAll(async () => {
      await s3db.connect();

      const resources = ["CachedLeads1", "CachedLeads2"];

      for (const res of resources) {
        if (!s3db.resources[res]) {
          await s3db.createResource({
            name: res,
            attributes: {
              name: "string",
              email: "email",
            },
          });
        }
      }

      await Promise.all(resources.map((r) => s3db.resource(r).deleteAll()));
    });

    it("should instantiate s3cache", () => {
      const resource = s3db.resource("CachedLeads1");

      expect(s3db.cache).toEqual(true);
      expect(resource.options.cache).toEqual(true);
      expect(resource.s3Cache).toBeDefined();
    });

    it("cached listIds", async () => {
      const resource: S3Resource = s3db.resource("CachedLeads1");
      const dataToInsert = new Array(10).fill(0).map((v, k) => ({
        id: `${k}`,
        name: fake.names.name(),
        email: fake.internet.email(),
      }));

      await resource.insertMany(dataToInsert);
      const ids1 = await resource.listIds();

      if (resource.s3Cache) {
        const resData = await resource.s3Cache.get({ action: "listIds" });
        expect(ids1).toEqual(resData);
      }

      const ids2 = await resource.listIds();
      expect(ids2).toEqual(ids1);
    });

    it("cached getAll", async () => {
      const resource = s3db.resource("CachedLeads2");
      const dataToInsert = new Array(10).fill(0).map((v, k) => ({
        id: `${k}`,
        name: fake.names.name(),
        email: fake.internet.email(),
      }));

      await resource.insertMany(dataToInsert);
      const datas1 = await resource.getAll();

      expect(datas1.length).toEqual(dataToInsert.length);
      expect(mapIds(datas1)).toEqual(mapIds(dataToInsert));

      if (resource.s3Cache) {
        const resData = await resource.s3Cache.get({ action: "getAll" });
        expect(datas1.length).toEqual(resData.length);
        expect(mapIds(datas1)).toEqual(mapIds(resData));
      }

      const datas2 = await resource.getAll();
      expect(datas2.length).toEqual(dataToInsert.length);
      expect(mapIds(datas2)).toEqual(mapIds(datas1));
    });
  });
});
