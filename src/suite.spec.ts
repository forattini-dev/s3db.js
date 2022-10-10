import S3db from ".";
import * as dotenv from "dotenv";

dotenv.config();

const {
  bucket = "",
  accessKeyId = "",
  secretAccessKey = "",
  prefix = "/databases/mydatabase",
} = process.env;

function ClientFactory() {
  return new S3db({
    uri: `s3://${accessKeyId}:${secretAccessKey}@${bucket}${prefix}`,
  });
}

jasmine.DEFAULT_TIMEOUT_INTERVAL = 10 * 1000;

describe("static config", function () {
  let client = ClientFactory();

  it("constructor definitions", async function () {
    expect(client.bucket).toBe(bucket);
    expect(client.keyPrefix).toBe("databases/mydatabase");
  });
});

describe("start", function () {
  let client = ClientFactory();

  it("setup", async function () {
    await client.setup()

    expect(client.metadata).toBeDefined();
    expect(client.metadata?.version).toBeDefined();
    expect(client.metadata?.resources).toBeDefined();
  });
});

describe("resources", function () {
  let client = ClientFactory();

  beforeAll(async function () {
    await client.setup();
  });

  it("create resourceList leads", async function () {
    await client.newResource({
      resourceName: "leads",
      attributes: {
        utm: {
          source: 'string|optional',
          medium: 'string|optional',
          campaign: 'string|optional',
          term: 'string|optional',
        },
        lead: {
          personalEmail: "email",
          fullName: "string",
          mobileNumber: "string",
        },
      },
    });

    expect(client.metadata.resources.leads).toBeDefined();
  });

  it("create a lead", async function () {
    let createdResource = await client.insert({
      resourceName: "leads",
      id: "mypersonal@email.com",
      attributes: {
        utm: {
          source: 'abc'
        },
        lead: {
          fullName: "My Complex Name",
          personalEmail: "mypersonal@email.com",
          mobileNumber: "+5511234567890",
        }
      },
    });

    const request = await client.getById({ resourceName: "leads", id: createdResource.id });
    await client.resource("leads").get(createdResource.id);
    
    expect(createdResource.id).toEqual(request.id);
  });
});
