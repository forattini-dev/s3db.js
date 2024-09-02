import S3Cache from "./s3-cache.class.js";
import Resource from "../resource.class.js";
import Serializers from "./serializers.type.js";

class S3ResourceCache extends S3Cache {
  constructor({ resource, compressData = true, serializer = Serializers.json }) {
    super({
      s3Client: resource.s3Client,
      compressData: compressData,
      serializer: serializer,
    });

    this.resource = resource;
  }

  getKey({ action = "list", params }) {
    const key = super.getKey({
      params,
      additionalPrefix: `resource=${this.resource.name}/action=${action}|`,
    });

    return key;
  }

  async put({ action = "list", params, data }) {
    return super._put({
      data,
      key: this.getKey({ action, params }),
    });
  }

  async get({ action = "list", params }) {
    return super._get({
      key: this.getKey({ action, params }),
    });
  }

  async delete({ action = "list", params }) {
    const key = this.getKey({ action, params });

    return super._delete({
      key,
    });
  }

  async purge() {
    const keys = await this.s3Client.getAllKeys({
      prefix: `cache/resource=${this.resource.name}`,
    });

    await this.s3Client.deleteObjects(keys);
  }
}

export default S3ResourceCache;
