import * as dotenv from "dotenv";

dotenv.config();
jest.setTimeout(30 * 1000);

const { bucket, accessKeyId, secretAccessKey } = process.env;

export const ENV = {
  PARALLELISM: 250,
  PASSPRHASE: "super-secret-leaked-fluffy-passphrase",

  CONNECTION_STRING: (testName = "general") =>
    `s3://${accessKeyId}:${secretAccessKey}@${bucket}/databases/${new Date()
      .toISOString()
      .substring(0, 10)}-test-${testName}`,
};
