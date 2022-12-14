import { ENV } from "./concerns";

import { nanoid } from "nanoid";
import Fakerator from "fakerator";

import { S3db } from "../src";
import { ClientNoSuchKey } from "../src/errors";

function S3dbFactory() {
  return new S3db({
    uri: ENV.CONNECTION_STRING("resources"),
    passphrase: "super-secret-leaked-fluffy-passphrase",
  });
}

const fake = Fakerator();

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
  additional: {
    number: "number",
    string: "string",
    boolean: "boolean",
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
    additional: {
      number: fake.random.number(100),
      string: fake.random.string(),
      boolean: fake.random.boolean(),
    },
    ...overwrite,
  };
}

const resources = new Array(2).fill(0).map((v, k) => `leads${k + 1}`);

const defaultBeforeAll = (s3db: S3db) => async () => {
  await s3db.connect();

  for (const name of resources) {
    if (!s3db.resources[name]) {
      await s3db.createResource({
        name,
        attributes,
      });
    }
  }
};

describe("resources", function () {
  const s3db = S3dbFactory();
  beforeAll(defaultBeforeAll(s3db));

  describe("definitions", function () {
    const s3db = S3dbFactory();
    beforeAll(defaultBeforeAll(s3db));

    for (const name of resources) {
      it(`[${name}] should be defined`, async function () {
        expect(s3db.resources[name]).toBeDefined();
        expect(s3db.resource(name)).toBeDefined();

        const functions = [
          "insert",
          "getById",
          "updateById",
          "deleteById",
          "bulkInsert",
          "count",
          "bulkDelete",
          "getAllIds",
          "deleteAll",
          "getAll",
        ];

        functions.forEach((f) => expect(s3db.resource(name)[f]).toBeDefined());
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

    it("should insert and update", async function () {
      const resource = s3db.resource(`leads1`);

      const data = resourceFactory({
        invalidAttr: "this will disappear",
      });

      const createdResource = await resource.insert(data);
      expect(createdResource.id).toEqual(data.id);

      await resource.updateById(data.id, {
        personalData: {
          fullName: "My New Name!",
        },
      });

      const foundResource = await resource.getById(data.id);
      expect(foundResource.id).toEqual(data.id);
      expect(foundResource.personalData.fullName).toEqual("My New Name!");
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
