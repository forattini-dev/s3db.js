import * as dotenv from "dotenv";

dotenv.config();
jasmine.DEFAULT_TIMEOUT_INTERVAL = 15 * 1000;

import Fakerator from "fakerator";

import S3Cache from "../src/s3-cache.class";
import S3Client from "../src/s3-client.class";
import Serializers from "../src/serializers.type";

const { bucket = "", accessKeyId = "", secretAccessKey = "" } = process.env;

const bucketPrefix = "databases/test-cache-" + Date.now();
const connectionString = `s3://${accessKeyId}:${secretAccessKey}@${bucket}/${bucketPrefix}`

describe("s3Cache", function () {
  const fakerator = Fakerator();

  it("constructor definitions", async function () {
    const s3Cache = new S3Cache({
      s3Client: new S3Client({ connectionString }),
    });

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

  const serializers = [
    Serializers.json, 
    // Serializers.avro 
  ]

  for (const compressData of [false, true]) {
    for (const serializer of serializers) {
      const testName = `${compressData ? '[zipped] ' : ''}with [${serializer}] serializer`

      describe(testName, async function () {
        const s3Cache = new S3Cache({
          compressData,
          serializer: Serializers[serializer],
          s3Client: new S3Client({
            connectionString
          }),
        });
  
        it("put small cache", async function () {
          const resourceName = "small-users";
          const params = {
            limit: 100,
          };
  
          const data = fakerator.lorem.sentence();
          await s3Cache.put({ resourceName, params, data });
  
          const res = await s3Cache.get({ resourceName, params });
          expect(data).toBe(res.data);
        });
  
        it("put big cache", async function () {
          const resourceName = "big-users";
          const params = {
            limit: 100,
          };
  
          const data = new Array(25).fill(0).map(() => fakerator.lorem.paragraph()).join(' ')
          await s3Cache.put({ resourceName, params, data });
  
          const res = await s3Cache.get({ resourceName, params });
          expect(data).toBe(res.data);
        });
      });

    }
  }
});
