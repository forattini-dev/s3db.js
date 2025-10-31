import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

class MockResource {
  constructor({ name }) {
    this.name = name;
    this.records = new Map();
  }

  async list({ limit } = {}) {
    const items = Array.from(this.records.values());
    return typeof limit === 'number' ? items.slice(0, limit) : items;
  }

  async get(id) {
    if (!this.records.has(id)) {
      throw new Error(`Resource "${this.name}" record "${id}" not found`);
    }
    return this.records.get(id);
  }

  async insert(item) {
    const id = item.sessionId || item.id || randomUUID();
    const record = { ...item, id };
    this.records.set(id, record);
    return record;
  }

  async update(id, item) {
    if (!this.records.has(id)) {
      throw new Error(`Resource "${this.name}" record "${id}" not found`);
    }
    const record = { ...item, id };
    this.records.set(id, record);
    return record;
  }

  async remove(id) {
    this.records.delete(id);
  }
}

export class MockDatabase extends EventEmitter {
  constructor() {
    super();
    this.resources = new Map();
    this.installedPlugins = [];
  }

  async connect() {}

  async disconnect() {}

  async installPlugin(plugin) {
    await plugin.install(this);
    this.installedPlugins.push(plugin);
  }

  async start() {
    for (const plugin of this.installedPlugins) {
      await plugin.start();
    }
  }

  async stop() {
    for (const plugin of this.installedPlugins) {
      await plugin.stop();
    }
  }

  async getResource(name) {
    if (!this.resources.has(name)) {
      throw new Error(`Resource "${name}" not found`);
    }
    return this.resources.get(name);
  }

  async createResource(definition) {
    const resource = new MockResource(definition);
    this.resources.set(definition.name, resource);
    return resource;
  }
}

export function createMockDatabase() {
  return new MockDatabase();
}
