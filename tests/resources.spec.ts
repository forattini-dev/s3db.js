import * as dotenv from "dotenv";

dotenv.config();
jasmine.DEFAULT_TIMEOUT_INTERVAL = 15 * 1000;

import { nanoid } from "nanoid";
import Fakerator from "fakerator";

import S3db from "../src";
import { NoSuchKey } from "../src/errors";

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

function ClientFactory() {
  return new S3db({
    uri: `s3://${accessKeyId}:${secretAccessKey}@${bucket}/${bucketPrefix}`,
    passphrase: "super-secret-leaked-passphrase",
  });
}

describe("resource [leads]", function () {
  let client = ClientFactory();

  beforeAll(async function () {
    await client.connect();

    for (const resourceName of ["leads1", `leads2`]) {
      await client.createResource({
        resourceName,
        attributes,
      });
    }
  });

  it("definition", async function () {
    for (const resourceName of ["leads1", `leads2`]) {
      expect(client.metadata.resources[resourceName]).toBeDefined();
      expect(client.resource(resourceName)).toBeDefined();
    }
  });

  it("create a single lead", async function () {
    const resource = client.resource(`leads1`);
    const data = resourceFactory({
      invalidAttr: "this will disappear",
    });

    let { isValid, errors } = resource.validate(data);
    expect(errors).toEqual([]);
    expect(isValid).toBeTruthy();

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
      expect(error instanceof NoSuchKey).toEqual(true);
    }
  });

  it("bulk create leads", async function () {
    const total = 15;
    const resource = client.resource(`leads2`);
    const leads = new Array(total).fill(0).map((v, k) => resourceFactory());

    const results = await resource.bulkInsert(leads);
    const ids = [
      ...new Set([
        ...leads.map((x: any) => x.id),
        ...results.map((x: any) => x.id),
      ]),
    ].sort();

    expect(ids.length).toEqual(total);
    leads.forEach((l) => expect(ids).toContain(l.id));

    const idsList = await resource.listIds();
    leads.forEach((l) => expect(idsList).toContain(l.id));

    await resource.bulkDelete(ids);

    const newIdsList = await resource.listIds();
    expect(newIdsList.length).toEqual(0);
  });
});
