import EventEmitter from 'events';

import { Database } from './database.class.js';
import { DatabaseError } from './errors.js';
import type { DatabaseOptions } from './database.class.js';
import type { CreateResourceConfig } from './database/database-resources.class.js';
import type Resource from './resource.class.js';

export interface DatabaseManagerOptions {
  connections: Record<string, DatabaseOptions>;
  default?: string;
}

export interface ManagerCreateResourceConfig extends CreateResourceConfig {
  connection?: string;
}

/**
 * Orchestrates multiple named Database instances, each with its own connection string.
 *
 * Resources can be created on specific connections, with unified lookup across all databases.
 */
export class DatabaseManager extends EventEmitter {
  private _databases: Map<string, Database>;
  private _resourceIndex: Map<string, string>;
  private _defaultConnection: string;

  constructor(options: DatabaseManagerOptions) {
    super();

    if (!options.connections || Object.keys(options.connections).length === 0) {
      throw new DatabaseError('DatabaseManager requires at least one connection', {
        operation: 'constructor',
        retriable: false,
        suggestion: 'Provide a connections map: { primary: { connectionString: "..." } }',
      });
    }

    const connectionNames = Object.keys(options.connections);
    this._defaultConnection = options.default || connectionNames[0]!;

    if (!options.connections[this._defaultConnection]) {
      throw new DatabaseError(`Default connection "${this._defaultConnection}" not found in connections`, {
        operation: 'constructor',
        retriable: false,
      });
    }

    this._databases = new Map();
    this._resourceIndex = new Map();

    for (const [name, dbOptions] of Object.entries(options.connections)) {
      const db = new Database(dbOptions);
      this._databases.set(name, db);
      this._forwardEvents(name, db);
    }
  }

  /**
   * Returns a Database instance by connection name.
   */
  connection(name: string): Database {
    const db = this._databases.get(name);
    if (!db) {
      throw new DatabaseError(`Connection "${name}" not found`, {
        operation: 'connection',
        retriable: false,
        suggestion: `Available connections: ${Array.from(this._databases.keys()).join(', ')}`,
      });
    }
    return db;
  }

  /**
   * Returns the default Database instance.
   */
  get defaultConnection(): Database {
    return this.connection(this._defaultConnection);
  }

  /**
   * Returns all connection names.
   */
  get connectionNames(): string[] {
    return Array.from(this._databases.keys());
  }

  /**
   * Creates a resource on a specific connection (via `connection` field) or default.
   */
  async createResource(config: ManagerCreateResourceConfig): Promise<Resource> {
    const { connection: connectionName = this._defaultConnection, ...resourceConfig } = config;

    const existingConnection = this._resourceIndex.get(resourceConfig.name);
    if (existingConnection && existingConnection !== connectionName) {
      throw new DatabaseError(
        `Resource "${resourceConfig.name}" already exists on connection "${existingConnection}". Resource names must be unique across all connections.`,
        {
          operation: 'createResource',
          retriable: false,
          suggestion: `Use a different name or access the existing resource via manager.resource("${resourceConfig.name}")`,
        }
      );
    }

    const db = this.connection(connectionName);
    const resource = await db.createResource(resourceConfig);
    this._resourceIndex.set(resourceConfig.name, connectionName);

    return resource;
  }

  /**
   * Looks up a resource by name across all connections.
   */
  resource(name: string): Resource {
    const connectionName = this._resourceIndex.get(name);

    if (connectionName) {
      const db = this._databases.get(connectionName)!;
      const res = db.resources[name];
      if (res) return res;
    }

    for (const [connName, db] of this._databases) {
      const res = db.resources[name];
      if (res) {
        this._resourceIndex.set(name, connName);
        return res;
      }
    }

    throw new DatabaseError(`Resource "${name}" not found in any connection`, {
      operation: 'resource',
      retriable: false,
      suggestion: `Available resources: ${this.resourceNames.join(', ') || '(none)'}`,
    });
  }

  /**
   * Returns all resource names across all connections.
   */
  get resourceNames(): string[] {
    const names: string[] = [];
    for (const db of this._databases.values()) {
      names.push(...Object.keys(db.resources));
    }
    return names;
  }

  /**
   * Returns a merged view of all resources across all connections.
   */
  get resources(): Record<string, Resource> {
    const merged: Record<string, Resource> = {};
    for (const db of this._databases.values()) {
      Object.assign(merged, db.resources);
    }
    return merged;
  }

  /**
   * Returns which connection owns a resource.
   */
  getConnectionForResource(name: string): string {
    const connectionName = this._resourceIndex.get(name);
    if (connectionName) return connectionName;

    for (const [connName, db] of this._databases) {
      if (db.resources[name]) {
        this._resourceIndex.set(name, connName);
        return connName;
      }
    }

    throw new DatabaseError(`Resource "${name}" not found in any connection`, {
      operation: 'getConnectionForResource',
      retriable: false,
    });
  }

  /**
   * Connects all databases in parallel.
   */
  async connect(): Promise<void> {
    await Promise.all(
      Array.from(this._databases.entries()).map(async ([name, db]) => {
        try {
          await db.connect();
        } catch (err) {
          throw new DatabaseError(`Failed to connect "${name}": ${(err as Error).message}`, {
            operation: 'connect',
            original: err,
            retriable: true,
          });
        }
      })
    );

    this._rebuildResourceIndex();
  }

  /**
   * Disconnects all databases in parallel.
   */
  async disconnect(): Promise<void> {
    await Promise.all(
      Array.from(this._databases.values()).map((db) => db.disconnect())
    );
    this._resourceIndex.clear();
  }

  /**
   * Returns true if all databases are connected.
   */
  isConnected(): boolean {
    for (const db of this._databases.values()) {
      if (!db.isConnected()) return false;
    }
    return this._databases.size > 0;
  }

  private _rebuildResourceIndex(): void {
    for (const [connName, db] of this._databases) {
      for (const resourceName of Object.keys(db.resources)) {
        this._resourceIndex.set(resourceName, connName);
      }
    }
  }

  private _forwardEvents(connectionName: string, db: Database): void {
    const forwardedEvents = [
      'db:connected',
      'db:disconnected',
      'db:resource-created',
      'db:resource-updated',
      'db:resource-deleted',
      'db:metadata-uploaded',
    ];

    for (const event of forwardedEvents) {
      db.on(event, (...args: unknown[]) => {
        this.emit(`${connectionName}:${event}`, ...args);
        this.emit(event, connectionName, ...args);
      });
    }
  }
}

export default DatabaseManager;
