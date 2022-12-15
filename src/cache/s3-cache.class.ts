import zlib from "zlib";
import * as path from "path";
import { isString } from "lodash";

import S3Client from "../s3-client.class";
import Serializers from "./serializers.type";
import { JsonSerializer } from "./json.serializer";
import { AvroSerializer } from "./avro.serializer";

export class S3Cache {
  serializers: any;
  s3Client: S3Client;
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
    this.s3Client = s3Client;
    this.serializer = serializer;
    this.compressData = compressData;

    this.serializers = {
      [Serializers.json]: JsonSerializer,
      [Serializers.avro]: AvroSerializer,
    };
  }

  getKey({
    params,
    hashed = true,
    additionalPrefix = "",
  }: {
    params?: any;
    hashed?: boolean;
    additionalPrefix?: string;
  }) {
    let filename: any =
      Object.keys(params || {})
        .sort()
        .map((x) => `${x}:${params[x]}`)
        .join("|") || "";

    if (filename.length === 0) filename = `empty`;

    if (hashed) {
      filename = Buffer.from(filename)
        .toString("base64")
        .split("")
        .reverse()
        .join("");
    }

    if (additionalPrefix.length > 0) {
      filename = additionalPrefix + filename;
    }

    filename = filename + "." + this.serializer;

    if (this.compressData) filename += ".gz";

    return path.join("cache", filename);
  }

  async _put({ key, data }: { key: string; data: any }) {
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
      "client-id": this.s3Client.id,
      serializer: String(this.serializer),
      compressed: String(this.compressData),
      "length-raw": String(lengthRaw),
      "length-serialized": String(lengthSerialized),
      "length-compressed": String(body.length),
    };

    return this.s3Client.putObject({
      key,
      body,
      metadata,
      contentEncoding: this.compressData ? "gzip" : null,
      contentType: this.compressData
        ? "application/gzip"
        : `application/${this.serializer}`,
    });
  }

  async _get({ key }: { key: string }) {
    try {
      const res = await this.s3Client.getObject(key);

      if (!res.Body) return "";
      let content = res.Body;

      if (res.Metadata) {
        const { serializer, compressor, compressed } = res.Metadata;

        if (["true", true].includes(compressed)) {
          if (compressor === `zlib`) {
            content = zlib.unzipSync(content as Buffer);
          }
        }

        const { data } = this.serializers[serializer].unserialize(content);
        return data;
      }

      return this.unserialize(content);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name !== "ClientNoSuchKey") {
          return Promise.reject(error);
        }
      }
    }

    return null;
  }

  async _delete({ key }: { key: string }) {
    try {
      await this.s3Client.deleteObject(key);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name !== "ClientNoSuchKey") {
          return Promise.reject(error);
        }
      }
    }

    return true;
  }

  serialize(data: any) {
    return this.serializers[this.serializer].serialize(data);
  }

  unserialize(data: any) {
    return this.serializers[this.serializer].unserialize(data);
  }
}

export default S3Cache