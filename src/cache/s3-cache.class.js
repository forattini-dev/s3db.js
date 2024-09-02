import zlib from "zlib";
import path from "path";
import { isString } from "lodash-es";
import sha256 from "crypto-js/sha256";

import Client from "../client.class.js";
import Serializers from "./serializers.type.js";
import { JsonSerializer } from "./json.serializer.js";
import { AvroSerializer } from "./avro.serializer.js";

class S3Cache {
  constructor({ s3Client, compressData = true, serializer = Serializers.json }) {
    this.s3Client = s3Client;
    this.serializer = serializer;
    this.compressData = compressData;

    this.serializers = {
      [Serializers.json]: JsonSerializer,
      [Serializers.avro]: AvroSerializer,
    };
  }

  getKey({ params, hashed = true, additionalPrefix = "" }) {
    let filename =
      Object.keys(params || {})
        .sort()
        .map((x) => `${x}:${params[x]}`)
        .join("|") || "";

    if (filename.length === 0) filename = `empty`;

    if (hashed) {
      filename = sha256(filename);
    }

    if (additionalPrefix.length > 0) {
      filename = additionalPrefix + filename;
    }

    filename = filename + "." + this.serializer;

    if (this.compressData) filename += ".gz";

    return path.join("cache", filename);
  }

  async _put({ key, data }) {
    const lengthRaw = isString(data)
      ? data.length
      : JSON.stringify(data).length;

    let body = this.serialize({ data });
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

  async _get({ key }) {
    try {
      const res = await this.s3Client.getObject(key);

      if (!res.Body) return "";
      let content = res.Body;

      if (res.Metadata) {
        const { serializer, compressor, compressed } = res.Metadata;

        if (["true", true].includes(compressed)) {
          if (compressor === `zlib`) {
            content = zlib.unzipSync(content);
          }
        }

        const { data } = this.serializers[serializer].unserialize(content);
        return data;
      }

      return this.unserialize(content);
    } catch (error) {
      if (error.name !== "ClientNoSuchKey") {
        return Promise.reject(error);
      }
    }

    return null;
  }

  async _delete({ key }) {
    try {
      await this.s3Client.deleteObject(key);
    } catch (error) {
      if (error.name !== "ClientNoSuchKey") {
        return Promise.reject(error);
      }
    }

    return true;
  }

  serialize(data) {
    return this.serializers[this.serializer].serialize(data);
  }

  unserialize(data) {
    return this.serializers[this.serializer].unserialize(data);
  }
}

export default S3Cache;
