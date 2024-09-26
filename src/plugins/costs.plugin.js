export const CostsPlugin = {
  async setup (db) {
    this.client = db.client

    this.map = {
      PutObjectCommand: 'put',
      GetObjectCommand: 'get',
      HeadObjectCommand: 'get',
      DeleteObjectCommand: 'delete',
      DeleteObjectsCommand: 'delete',
      ListObjectsV2Command: 'list',
    }

    this.costs = {
      total: 0,
      prices: {
        put: 0.005 / 1000,
        copy: 0.005 / 1000,
        list: 0.005 / 1000,
        post: 0.005 / 1000,
        get: 0.0004 / 1000,
        select: 0.0004 / 1000,
        delete: 0.0004 / 1000,
      },
      requests: {
        total: 0,
        put: 0,
        post: 0,
        copy: 0,
        list: 0,
        get: 0,
        select: 0,
        delete: 0,
      },
      events: {
        total: 0,
        PutObjectCommand: 0,
        GetObjectCommand: 0,
        HeadObjectCommand: 0,
        DeleteObjectCommand: 0,
        DeleteObjectsCommand: 0,
        ListObjectsV2Command: 0,
      }
    }

    this.client.costs = JSON.parse(JSON.stringify(this.costs));
  },
  
  async start () {
    this.client.on("command.response", (name) => this.addRequest(name, this.map[name]));
  },

  addRequest (name, method) {
    this.costs.events[name]++;
    this.costs.events.total++;
    this.costs.requests.total++;
    this.costs.requests[method]++;
    this.costs.total += this.costs.prices[method];

    this.client.costs.events[name]++;
    this.client.costs.events.total++;
    this.client.costs.requests.total++;
    this.client.costs.requests[method]++;      
    this.client.costs.total += this.client.costs.prices[method];
  },
}

export default CostsPlugin