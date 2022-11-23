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

  CostsPlugin: {
    async setup (s3db) {
      this.client = s3db.client
      
      this.client.costs = {
        total: 0,
        
        prices: {
          put: 0.000005,
          post: 0.000005,
          copy: 0.000005,
          list: 0.000005,
          get: 0.0000004,
          select: 0.0000004,
          delete: 0.0000004,
        },

        requests: {
          total: 0,
          put: 0,
          post: 0,
          copy: 0,
          list: 0,
          get: 0,
          select: 0,
          delete: 0,
        },
      };
    },

    start () {
      const addRequest = (req) => {
        this.client.costs.requests[req]++;
        this.client.costs.total += this.client.costs.prices[req];
      };
  
      this.client.on("request", (name) => {
        this.client.costs.requests.total++;
  
        if (name === "getObject") addRequest("get");
        else if (name === "putObject") addRequest("put");
        else if (name === "headObject") addRequest("get");
        else if (name === "deleteObject") addRequest("delete");
        else if (name === "deleteObjects") addRequest("delete");
        else if (name === "listObjectsV2") addRequest("list");
      });
    }
  },
};
