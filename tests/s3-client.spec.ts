import { ConnectionString } from "./concerns";
import { S3Client } from "../src";

describe("client", function () {
  it("default config", async function () {
    const connectionString = ConnectionString("s3-database");
    const client = new S3Client({ connectionString });
    const uri = new URL(connectionString);

    expect(client.bucket).toBe(uri.hostname);
    expect(client.parallelism).toBe(10);
  });
  
  it("set parallelism with query", async function () {
    const connectionString = ConnectionString("s3-database") + '?parallelism=123';
    const client = new S3Client({ connectionString });
    expect(client.parallelism).toBe(123);
  });
  
  it("set parallelism with constructor", async function () {
    const connectionString = ConnectionString("s3-database");
    const client = new S3Client({ 
      connectionString,
      parallelism: 234,
    });
    expect(client.parallelism).toBe(234);
  });
});
