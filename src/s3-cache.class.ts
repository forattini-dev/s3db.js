import avro from "avsc";
import zlib from "node:zlib";
import * as path from "path";
import { isString } from "lodash";

import S3Client from "./s3-client.class";
import Serializers from "./serializers.type";

export const CacheAvroSchema = avro.Type.forSchema({
  name: "Cache",
  type: "record",
  fields: [{ name: "data", type: ["string"] }],
});

const serializers = (name: Serializers) => {
  return {
    [Serializers.json]: (data: any) => JSON.stringify(data),
    [Serializers.avro]: (data: any) => String(CacheAvroSchema.toBuffer(data)),
  }[name];
};

const unserializers = (name: Serializers) => {
  return {
    [Serializers.json]: (data: any) => JSON.parse(data),
    [Serializers.avro]: (data: any) =>
      CacheAvroSchema.fromBuffer(Buffer.from(data)),
  }[name];
};

export default class S3Cache {
  client: S3Client;
  compressData: boolean;
  serializer: Serializers;

  constructor({
    s3Client,
    compressData = true,
    serializer = Serializers.json,
  }: {
    s3Client: S3Client;
    compressData?: boolean;
    serializer?: Serializers;
  }) {
    this.client = s3Client;
    this.serializer = serializer;
    this.compressData = compressData;
  }

  key({
    resourceName,
    action = "list",
    params,
  }: {
    resourceName: string;
    action?: string;
    params: any;
  }) {
    const keys = Object.keys(params)
      .sort()
      .map((x) => `${x}:${params[x]}`);

    keys.unshift(`action:${action}`);
    keys.unshift(`resource:${resourceName}`);

    const filename = `${keys.join("|")}.${this.serializer}${this.compressData ? '.zip' : ''}`

    return path.join("cache", filename);
  }

  async put({
    resourceName,
    action = "list",
    params,
    data,
  }: {
    resourceName: string;
    action?: string;
    params: any;
    data: any;
  }) {
    const key = this.key({ resourceName, action, params });
    const lengthRaw = isString(data)
      ? data.length
      : JSON.stringify(data).length;

    let body: string | Uint8Array = this.serialize({ data });
    const lengthSerialized = body.length;

    if (this.compressData) {
      body = zlib.gzipSync(body);
    }

    const metadata = {
      compressor: "zlib",
      "client-id": this.client.id,
      serializer: String(this.serializer),
      compressed: String(this.compressData),
      "length-raw": String(lengthRaw),
      "length-serialized": String(lengthSerialized),
      "length-compressed": String(body.length),
    };

    return this.client.putObject({
      key,
      body,
      metadata,
      contentEncoding: this.compressData ? "gzip" : null,
      contentType: this.compressData ? "application/gzip" : `application/${this.serializer}`,
    });
  }

  async get({
    resourceName,
    action = "list",
    params,
  }: {
    resourceName: string;
    action?: string;
    params: any;
  }) {
    const key = this.key({ resourceName, action, params });
    const res = await this.client.getObject({ key });

    let data = res.Body;

    if (res.Metadata) {
      if (
        res.Metadata.compressed &&
        ["true", true].includes(res.Metadata.compressed)
      ) {
        data = zlib.unzipSync(data);
      }
    }

    // console.log({ data });
    return this.unserialize(data);
  }

  serialize(data: any) {
    return serializers(this.serializer)(data);
  }

  unserialize(data: any) {
    return unserializers(this.serializer)(data);
  }
}
