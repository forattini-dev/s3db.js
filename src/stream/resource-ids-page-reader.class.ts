import ResourceIdsReader from "./resource-ids-reader.class.js";

export class ResourceIdsPageReader extends ResourceIdsReader {
  override enqueue(ids: string[]): void {
    this.controller.enqueue(ids);
    this.emit("page", ids);
  }
}

export default ResourceIdsPageReader;
