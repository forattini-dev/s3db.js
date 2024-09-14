import { Client, Database } from "../dist/s3db.es.js"

describe("Dist", () => {
  it("should export Client", () => {
    expect(typeof Client).toBe("function")
  })

  it("should export Database", () => {
    expect(typeof Database).toBe("function")
  })
})
