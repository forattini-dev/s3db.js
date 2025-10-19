export const CostsPlugin = {
  async setup (db) {
    if (!db || !db.client) {
      return; // Handle null/invalid database gracefully
    }

    this.client = db.client

    this.map = {
      PutObjectCommand: 'put',
      GetObjectCommand: 'get',
      HeadObjectCommand: 'head',
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
        head: 0.0004 / 1000,
      },
      totalRequests: 0,
      requests: {
        total: 0,  // Added for consistency with tests
        put: 0,
        post: 0,
        copy: 0,
        list: 0,
        get: 0,
        select: 0,
        delete: 0,
        head: 0,
      },
      totalEvents: 0,
      events: {
        total: 0,  // Added for consistency
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
    if (this.client) {
      this.client.on("command.response", (name) => this.addRequest(name, this.map[name]));
      this.client.on("command.error", (name) => this.addRequest(name, this.map[name]));
    }
  },

  addRequest (name, method) {
    if (!method) return; // Skip if no mapping found

    this.costs.totalEvents++;
    this.costs.totalRequests++;
    this.costs.events.total++;
    this.costs.events[name]++;
    this.costs.requests.total++;
    this.costs.requests[method]++;
    this.costs.total += this.costs.prices[method];

    if (this.client && this.client.costs) {
      this.client.costs.totalEvents++;
      this.client.costs.totalRequests++;
      this.client.costs.events.total++;
      this.client.costs.events[name]++;
      this.client.costs.requests.total++;
      this.client.costs.requests[method]++;
      this.client.costs.total += this.client.costs.prices[method];
    }
  },
}

export default CostsPlugin