import zlib from "zlib";
import * as path from "path";
import { isString } from "lodash";

import { JsonSerializer } from "./json.serializer";
import { AvroSerializer } from "./avro.serializer";
import S3Client from "../s3-client.class";
import Serializers from "./serializers.type";

export default class S3Cache {
  client: S3Client;
  serializers: any;
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

    this.serializers = {
      [Serializers.json]: JsonSerializer,
      [Serializers.avro]: AvroSerializer,
    };
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

    let filename = keys.join("|") + "." + this.serializer;
    if (this.compressData) filename += ".gz";

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
      contentType: this.compressData
        ? "application/gzip"
        : `application/${this.serializer}`,
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

    if (!res.Body) return "";
    let data = res.Body;

    if (res.Metadata) {
      const { serializer, compressor, compressed } = res.Metadata;

      if (["true", true].includes(compressed)) {
        if (compressor === `zlib`) {
          data = zlib.unzipSync(data as Buffer);
        }
      }

      return this.serializers[serializer].unserialize(data);
    }

    return this.unserialize(data);
  }

  serialize(data: any) {
    return this.serializers[this.serializer].serialize(data);
  }

  unserialize(data: any) {
    return this.serializers[this.serializer].unserialize(data);
  }
}
