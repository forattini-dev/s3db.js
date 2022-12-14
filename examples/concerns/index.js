require("dotenv").config({ path: `${process.cwd()}/../.env` });

const { bucket, accessKeyId, secretAccessKey } = process.env;

module.exports = {
  ENV: {
    PARALLELISM: 250,
    PASSPRHASE: 'super-secret-leaked-fluffy-passphrase',
    CONNECTION_STRING:
      `s3://${accessKeyId}:${secretAccessKey}@${bucket}/databases/examples-` +
      new Date().toISOString().substring(0, 10),
  },

  S3db: require("../../build").S3db,

  CostsPlugin: require("../../build").CostsPlugin,
};
