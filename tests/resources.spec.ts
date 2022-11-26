import * as dotenv from "dotenv";

dotenv.config();
jest.setTimeout(30 * 1000);

import { nanoid } from "nanoid";
import Fakerator from "fakerator";

import S3db from "../src";
import { ClientNoSuchKey } from "../src/errors";

const { bucket = "", accessKeyId = "", secretAccessKey = "" } = process.env;

const fake = Fakerator();
const bucketPrefix = "databases/test-resources-" + Date.now();

const attributes = {
  token: "secret",
  utm: {
    source: "string|optional",
    medium: "string|optional",
    campaign: "string|optional",
    term: "string|optional",
  },
  personalData: {
    fullName: "string",
    mobileNumber: "string",
    personalEmail: "email",
  },
};

function resourceFactory(overwrite = {}) {
  return {
    id: nanoid(),
    token: fake.misc.uuid(),
    utm: {
      source: ["google", "facebook", "instagram", "linkedin"][
        fake.random.number(3)
      ],
      medium: ["email", "ads", "whatsapp"][fake.random.number(2)],
      campaign: ["christmas", "world-cup", "easter"][fake.random.number(2)],
    },
    personalData: {
      fullName: fake.names.name(),
      mobileNumber: fake.phone.number(),
      personalEmail: fake.internet.email(),
    },
    ...overwrite,
  };
}

const resources = new Array(2).fill(0).map((v, k) => `leads${k + 1}`);

function S3dbFactory() {
  return new S3db({
    uri: `s3://${accessKeyId}:${secretAccessKey}@${bucket}/${bucketPrefix}`,
    passphrase: "super-secret-leaked-passphrase",
  });
}

const defaultBeforeAll = (s3db: S3db) => {
  return async function () {
    await s3db.connect();

    for (const resourceName of resources) {
      if (!s3db.resources[resourceName]) {
        await s3db.createResource({
          resourceName,
          attributes,
        });
      }
    }
  }
}

describe("resources", function () {
  const s3db = S3dbFactory();
  beforeAll(defaultBeforeAll(s3db));

  describe("definitions", function () {
    const s3db = S3dbFactory();
    beforeAll(defaultBeforeAll(s3db));

    for (const resourceName of resources) {
      it(`[${resourceName}] should be defined`, async function () {
        expect(s3db.resources[resourceName]).toBeDefined();
        expect(s3db.resource(resourceName)).toBeDefined();
        
        const functions = [
          "count",
          "insert",
          "getById",
          "deleteById",
          "bulkInsert",
          "bulkDelete",
        ];
        
        functions.forEach(f => expect(s3db.resource(resourceName)[f]).toBeDefined())
      });
    }
  });

  describe("working single", function () {
    const s3db = S3dbFactory();
    beforeAll(defaultBeforeAll(s3db));
    
    it("should be valid", async function () {
      const resource = s3db.resource(`leads1`);
      const data = resourceFactory({
        invalidAttr: "this will disappear",
      });

      let { isValid, errors } = resource.validate(data);
      expect(errors).toEqual([]);
      expect(isValid).toBeTruthy();
    });

    it("should insert and delete", async function () {
      const resource = s3db.resource(`leads1`);

      const data = resourceFactory({
        invalidAttr: "this will disappear",
      });

      const createdResource = await resource.insert(data);
      expect(createdResource.id).toEqual(data.id);
      expect(createdResource.invalidAttr).toBeUndefined();

      const resourceFromS3 = await resource.getById(createdResource.id);
      expect(resourceFromS3.id).toEqual(data.id);
      expect(resourceFromS3.id).toEqual(createdResource.id);
      expect(resourceFromS3.invalidAttr).toBeUndefined();

      await resource.deleteById(resourceFromS3.id);

      try {
        await resource.getById(resourceFromS3.id);
      } catch (error: unknown) {
        expect(error instanceof ClientNoSuchKey).toEqual(true);
      }
    });
  });

  describe("working in multiples", function () {
    const amount = 10;

    it("should bulk create and bulk delete", async function () {
      const resource = s3db.resource(`leads2`);
      const leads = new Array(amount).fill(0).map((v, k) => resourceFactory());

      const results = await resource.bulkInsert(leads);
      const leadsIds = leads.map((x: any) => x.id).sort();
      const createdIds = results.map((x: any) => x.id).sort();

      expect(leadsIds.length).toEqual(amount);
      expect(createdIds.length).toEqual(amount);
      leads.forEach((l) => expect(createdIds).toContain(l.id));

      const liveCount = await resource.count();
      expect(liveCount).toEqual(amount);

      const idsList = await resource.getAllIds();
      leads.forEach((l) => expect(idsList).toContain(l.id));
      await resource.bulkDelete(idsList);

      const resourceCount = await resource.count();
      expect(resourceCount).toEqual(0);
    });
  });
});
