import S3Cache from "./s3-cache.class";
import S3Resource from "../s3-resource.class";
import Serializers from "./serializers.type";

export class S3ResourceCache extends S3Cache {
  resource: S3Resource;

  constructor({
    resource,
    compressData = true,
    serializer = Serializers.json,
  }: {
    resource: S3Resource;
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
    const key = super.getKey({
      params,
      additionalPrefix: `resource=${this.resource.name}/action=${action}|`,
    });

    return key
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
    const keys = await this.s3Client.getAllKeys({
      prefix: `cache/resource=${this.resource.name}`,
    });

    await this.s3Client.deleteObjects(keys);
  }
}

export default S3ResourceCache
