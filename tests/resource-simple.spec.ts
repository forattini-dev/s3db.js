import * as dotenv from "dotenv";

dotenv.config();
jasmine.DEFAULT_TIMEOUT_INTERVAL = 15 * 1000;

import S3db from "../src";

const { bucket = "", accessKeyId = "", secretAccessKey = "" } = process.env;

const bucketPrefix = "databases/marketing-" + Date.now();
const resourceName = `leads`;

const attributes = {
  utm: {
    source: "string|optional",
    medium: "string|optional",
    campaign: "string|optional",
    term: "string|optional",
  },
  lead: {
    personalEmail: "email",
    fullName: "string",
    mobileNumber: "string",
  },
};

function ClientFactory() {
  return new S3db({
    uri: `s3://${accessKeyId}:${secretAccessKey}@${bucket}/${bucketPrefix}`,
  });
}

describe("resource [leads]", function () {
  let client = ClientFactory();

  beforeAll(async function () {
    await client.connect();

    await client.newResource({
      resourceName,
      attributes,
    });
  });

  it("create single leads", async function () {
    const createdResource = await client.insert({
      resourceName,
      attributes: {
        id: "mypersonal@email.com",
        utm: {
          source: "abc",
        },
        lead: {
          fullName: "My Complex Name",
          personalEmail: "mypersonal@email.com",
          mobileNumber: "+5511234567890",
        },
        invalidAttr: "this will disappear",
      },
    });

    const request = await client.getById({
      resourceName,
      id: createdResource.id,
    });
    await client.resource(resourceName).get(createdResource.id);

    expect(createdResource.id).toEqual(request.id);
  });

  it("bulk create leads", async function () {
    const leads = new Array(25).fill(0).map((v, k) => ({
      id: `bulk-${k}@mymail.com`,
      lead: {
        fullName: "My Test Name",
        personalEmail: `bulk-${k}@mymail.com`,
        mobileNumber: "+55 34 234567890",
      },
      invalidAttr: "this will disappear",
    }));

    await client.resource(resourceName).bulkInsert(leads);
  });
});
