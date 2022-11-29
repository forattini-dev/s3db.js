import S3Cache from "./s3-cache.class";
import Resource from "../resource.class";
import Serializers from "./serializers.type";

export default class S3ResourceCache extends S3Cache {
  resource: Resource;

  constructor({
    resource,
    compressData = true,
    serializer = Serializers.json,
  }: {
    resource: Resource;
    compressData?: boolean;
    serializer?: Serializers;
  }) {
    super({
      s3Client: resource.s3Client,
      compressData: compressData,
      serializer: serializer,
    });

    this.resource = resource;
  }

  getKey({ action = "list", params }: { action?: string; params?: any }) {
    return super.getKey({
      params,
      additionalPrefix: `${this.resource.name}|${action}`,
    });
  }

  async put({
    action = "list",
    params,
    data,
  }: {
    action?: string;
    params?: any;
    data: any;
  }) {
    return super._put({
      data,
      key: this.getKey({ action, params }),
    });
  }

  async get({ action = "list", params }: { action?: string; params?: any }) {
    return super._get({
      key: this.getKey({ action, params }),
    });
  }

  async delete({ action = "list", params }: { action?: string; params: any }) {
    const key = this.getKey({ action, params });

    return super._delete({
      key: this.getKey({ action, params }),
    });
  }

  async purge() {
    let keys = await this.s3Client.getAllKeys({ prefix: "cache" });

    const key = Buffer.from(this.resource.name)
      .toString("base64")
      .split("")
      .reverse()
      .join("");

    keys = keys.filter((k) => k.includes(key));

    await this.s3Client.deleteObjects(keys);
  }
}
