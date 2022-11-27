import { ENV } from "./concerns";

import Fakerator from "fakerator";

import S3Client from "../src/s3-client.class";
import S3Cache from "../src/cache/s3-cache.class";
import Serializers from "../src/cache/serializers.type";

const fake = Fakerator();

const COMPRESS_OPTIONS = [false, true];

const SERIALIZERS_OPTIONS = [
  Serializers.json,
  // Serializers.avro,
];

const SIZES_OPTIONS = {
  small: () => fake.lorem.sentence(),

  medium: () =>
    new Array(25)
      .fill(0)
      .map(() => fake.lorem.paragraph())
      .join(" "),

  large: () =>
    new Array(500)
      .fill(0)
      .map(() => fake.lorem.paragraph())
      .join(" "),
};

describe("s3Cache", function () {
  const s3Client = new S3Client({
    connectionString: ENV.CONNECTION_STRING("cache"),
  });

  it("constructor definitions", async function () {
    const s3Cache = new S3Cache({ s3Client });

    const key = s3Cache.key({
      resourceName: "users",
      params: {
        a: 1,
        b: 2,
        c: 3,
      },
    });

    expect(key).toContain("a:1");
    expect(key).toContain("b:2");
    expect(key).toContain("c:3");
  });

  for (const serializer of SERIALIZERS_OPTIONS) {
    for (const compressData of COMPRESS_OPTIONS) {
      for (const sizeDefinition of Object.entries(SIZES_OPTIONS)) {
        describe(`${serializer} serializer`, () => {
          describe(compressData ? "compressed" : `not compressed`, () => {
            const [sizeName, sizeFn] = sizeDefinition;

            const data = sizeFn();
            const params = { limit: 100, page: 1 };
            const resourceName = `${sizeName}-users`;

            const s3Cache = new S3Cache({
              compressData,
              serializer: Serializers[serializer],
              s3Client: new S3Client({
                connectionString: ENV.CONNECTION_STRING("cache"),
              }),
            });

            it(`put ${sizeName} cache`, async function () {
              await s3Cache.put({ resourceName, params, data });

              const res = await s3Cache.get({ resourceName, params });

              expect(data).toBe(res.data);
            });
          });
        });
      }
    }
  }
});
