import * as dotenv from "dotenv";

dotenv.config();
jasmine.DEFAULT_TIMEOUT_INTERVAL = 15 * 1000;

import S3db from "../src";

const {
  bucket = "",
  accessKeyId = "",
  secretAccessKey = "",
} = process.env;

const bucketPrefix =  "databases/auth-" + Date.now()
const resourceName = `users`

const attributes = {
  name: 'string|optional',
  email: "email",
  password: 'secret',
  mobileNumber: "string",
}

function ClientFactory() {
  return new S3db({
    uri: `s3://${accessKeyId}:${secretAccessKey}@${bucket}/${bucketPrefix}`,
    passphrase: 'super-secret',
  });
}

describe("resource [users]", function () {
  let client = ClientFactory();

  beforeAll(async function () {
    await client.connect();
    
    await client.newResource({
      resourceName,
      attributes,
    });
  });

  it("verbose create single user", async function () {
    const createdResource = await client.insert({
      resourceName,
      attributes: {
        id: "mypersonal1@email.com",
        name: "My Complex Name",
        email: "mypersona1l@email.com",
        password: 'my-strong-password',
        mobileNumber: "+5511234567890",
        invalidAttr: 'this will disappear',
      },
    });

    const request = await client.getById({ resourceName, id: createdResource.id });
    await client.resource(resourceName).get(createdResource.id);
    
    expect(createdResource.id).toEqual(request.id);
    expect(createdResource.password).not.toEqual(request.password);
  });

  it("simple create single user", async function () {
    const createdResource = await client.resource('users')
      .insert({
        id: "mypersonal2@email.com",
        name: "My Complex Name",
        email: "mypersonal2@email.com",
        password: 'my-strong-password',
        mobileNumber: "+5511234567890",
        invalidAttr: 'this will disappear',
      });

    const request = await client.getById({ resourceName, id: createdResource.id });
    await client.resource(resourceName).get(createdResource.id);
    
    expect(createdResource.id).toEqual(request.id);
    expect(createdResource.password).not.toEqual(request.password);
  });
});
