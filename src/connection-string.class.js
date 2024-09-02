export const S3_DEFAULT_REGION = "us-east-1";
export const S3_DEFAULT_ENDPOINT = "https://s3.us-east-1.amazonaws.com";

export class ConnectionString {
  constructor(connectionString) {
    let uri

    try {
      uri = new URL(connectionString);
    } catch (error) {
      throw new Error("Invalid connection string: " + connectionString)
    }
    
    this.region = S3_DEFAULT_REGION;
    if (uri.protocol === "s3:") this.defineS3(uri);
    else this.defineMinio(uri);
    
    for (const [k, v] of uri.searchParams.entries()) {
      this[k] = v;
    }
  }

  defineS3(uri) {
    this.bucket = uri.hostname;
    this.accessKeyId = uri.username;
    this.secretAccessKey = uri.password;
    this.endpoint = S3_DEFAULT_ENDPOINT;

    if (["/", "", null].includes(uri.pathname)) {
      this.keyPrefix = "";
    } else {
      let [, ...subpath] = uri.pathname.split("/");
      this.keyPrefix = [...(subpath || [])].join("/");
    }
  }

  defineMinio(uri) {
    this.forcePathStyle = true;

    this.endpoint = uri.origin;
    this.accessKeyId = uri.username;
    this.secretAccessKey = uri.password;

    if (["/", "", null].includes(uri.pathname)) {
      this.bucket = "s3db";
      this.keyPrefix = "";
    } else {
      let [, bucket, ...subpath] = uri.pathname.split("/");
      
      this.bucket = bucket;
      this.keyPrefix = [...(subpath || [])].join("/");
    }
  }
}

export default ConnectionString;