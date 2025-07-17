export const S3_DEFAULT_REGION = "us-east-1";
export const S3_DEFAULT_ENDPOINT = "https://s3.us-east-1.amazonaws.com";

import tryFn, { tryFnSync } from "./concerns/try-fn.js";
import { ConnectionStringError } from "./errors.js";

export class ConnectionString {
  constructor(connectionString) {
    let uri;

    const [ok, err, parsed] = tryFn(() => new URL(connectionString));
    if (!ok) {
      throw new ConnectionStringError("Invalid connection string: " + connectionString, { original: err, input: connectionString });
    }
    uri = parsed;
    // defaults:
    this.region = S3_DEFAULT_REGION;
    
    // config:
    if (uri.protocol === "s3:") this.defineFromS3(uri);
    else this.defineFromCustomUri(uri);
    
    for (const [k, v] of uri.searchParams.entries()) {
      this[k] = v;
    }
  }

  defineFromS3(uri) {
    const [okBucket, errBucket, bucket] = tryFnSync(() => decodeURIComponent(uri.hostname));
    if (!okBucket) throw new ConnectionStringError("Invalid bucket in connection string", { original: errBucket, input: uri.hostname });
    this.bucket = bucket || 's3db';
    const [okUser, errUser, user] = tryFnSync(() => decodeURIComponent(uri.username));
    if (!okUser) throw new ConnectionStringError("Invalid accessKeyId in connection string", { original: errUser, input: uri.username });
    this.accessKeyId = user;
    const [okPass, errPass, pass] = tryFnSync(() => decodeURIComponent(uri.password));
    if (!okPass) throw new ConnectionStringError("Invalid secretAccessKey in connection string", { original: errPass, input: uri.password });
    this.secretAccessKey = pass;
    this.endpoint = S3_DEFAULT_ENDPOINT;

    if (["/", "", null].includes(uri.pathname)) {
      this.keyPrefix = "";
    } else {
      let [, ...subpath] = uri.pathname.split("/");
      this.keyPrefix = [...(subpath || [])].join("/");
    }
  }

  defineFromCustomUri(uri) {
    this.forcePathStyle = true;
    this.endpoint = uri.origin;
    const [okUser, errUser, user] = tryFnSync(() => decodeURIComponent(uri.username));
    if (!okUser) throw new ConnectionStringError("Invalid accessKeyId in connection string", { original: errUser, input: uri.username });
    this.accessKeyId = user;
    const [okPass, errPass, pass] = tryFnSync(() => decodeURIComponent(uri.password));
    if (!okPass) throw new ConnectionStringError("Invalid secretAccessKey in connection string", { original: errPass, input: uri.password });
    this.secretAccessKey = pass;

    if (["/", "", null].includes(uri.pathname)) {
      this.bucket = "s3db";
      this.keyPrefix = "";
    } else {
      let [, bucket, ...subpath] = uri.pathname.split("/");
      if (!bucket) {
        this.bucket = "s3db";
      } else {
        const [okBucket, errBucket, bucketDecoded] = tryFnSync(() => decodeURIComponent(bucket));
        if (!okBucket) throw new ConnectionStringError("Invalid bucket in connection string", { original: errBucket, input: bucket });
        this.bucket = bucketDecoded;
      }
      this.keyPrefix = [...(subpath || [])].join("/");
    }
  }
}

export default ConnectionString;