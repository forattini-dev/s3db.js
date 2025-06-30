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
    
    // defaults:
    this.region = S3_DEFAULT_REGION;
    
    // config:
    if (uri.protocol === "s3:") this.defineS3(uri);
    else this.defineMinio(uri);
    
    for (const [k, v] of uri.searchParams.entries()) {
      this[k] = v;
    }
  }

  defineS3(uri) {
    this.bucket = decodeURIComponent(uri.hostname);
    this.accessKeyId = decodeURIComponent(uri.username);
    this.secretAccessKey = decodeURIComponent(uri.password);
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
    this.accessKeyId = decodeURIComponent(uri.username);
    this.secretAccessKey = decodeURIComponent(uri.password);

    if (["/", "", null].includes(uri.pathname)) {
      this.bucket = "s3db";
      this.keyPrefix = "";
    } else {
      let [, bucket, ...subpath] = uri.pathname.split("/");
      
      this.bucket = decodeURIComponent(bucket);
      this.keyPrefix = [...(subpath || [])].join("/");
    }
  }
}

export default ConnectionString;