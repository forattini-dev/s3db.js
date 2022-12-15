import { ConnectionString } from "./concerns";
import { ResourceIdsReadStream, S3db } from "../src";

describe("streams", function () {
  it("write and get its id", async function () {
    const s3db = new S3db({ uri: ConnectionString("streams") });
    await s3db.connect();

    const resource = await s3db.createResource({
      name: "leads",
      attributes: {
        name: "string",
        email: "email",
      },
    });

    const obj = await resource.insert({
      name: "test",
      email: "test@email.com",
    })

    const stream = new ResourceIdsReadStream({ resource });

    try {
      await new Promise((resolve, reject) => {
        stream.on(`id`, (id) => {
          expect(id).toEqual(obj.id)
          resolve(id)
        })
  
        stream.on(`error`, reject)
      })
    } catch (error) {
      
    } finally {
      await resource.deleteAll()
    }
  });
});
