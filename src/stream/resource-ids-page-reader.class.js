import ResourceIdsReader from "./resource-ids-reader.class";

export class ResourceIdsPageReader extends ResourceIdsReader {
  enqueue(ids) {
    this.controller.enqueue(ids)
    this.emit("page", ids);
  }
}

export default ResourceIdsPageReader
