import { DatabaseError } from '../errors.js';
import type { SqlExecutor, SqlExecutorResult, SqlExecutorResultRow, SqlStatement } from './sql-executor.types.js';

interface LibsqlClientLike {
  execute(input: string | { sql: string; args?: unknown[] }): Promise<{ rows?: unknown[] }>;
  batch?(statements: Array<{ sql: string; args?: unknown[] }>): Promise<Array<{ rows?: unknown[] }>>;
  sync?(): Promise<void>;
  close(): void;
}

export class LibsqlExecutor implements SqlExecutor {
  private readonly url: string;
  private readonly authToken?: string;
  private readonly syncUrl?: string;
  private readonly syncInterval?: number;
  private clientPromise: Promise<LibsqlClientLike> | null = null;

  constructor(config: { url: string; authToken?: string; syncUrl?: string; syncInterval?: number }) {
    this.url = config.url;
    this.authToken = config.authToken;
    this.syncUrl = config.syncUrl;
    this.syncInterval = config.syncInterval;
  }

  async execute(sql: string, args: unknown[] = []): Promise<SqlExecutorResult> {
    const client = await this.getClient();
    const result = await client.execute({ sql, args });
    const rows = Array.isArray(result.rows)
      ? result.rows.map(row => ({ ...(row as Record<string, unknown>) }) as SqlExecutorResultRow)
      : [];
    return { rows };
  }

  async batch(statements: SqlStatement[]): Promise<SqlExecutorResult[]> {
    const client = await this.getClient();
    if (typeof client.batch === 'function') {
      const results = await client.batch(statements.map(s => ({ sql: s.sql, args: s.args || [] })));
      return results.map(r => ({
        rows: Array.isArray(r.rows)
          ? r.rows.map(row => ({ ...(row as Record<string, unknown>) }) as SqlExecutorResultRow)
          : []
      }));
    }
    const results: SqlExecutorResult[] = [];
    for (const stmt of statements) {
      results.push(await this.execute(stmt.sql, stmt.args || []));
    }
    return results;
  }

  async sync(): Promise<void> {
    const client = await this.getClient();
    if (typeof client.sync === 'function') await client.sync();
  }

  async close(): Promise<void> {
    if (!this.clientPromise) {
      return;
    }
    const client = await this.clientPromise;
    client.close();
  }

  private async getClient(): Promise<LibsqlClientLike> {
    if (!this.clientPromise) {
      this.clientPromise = this.createClient();
    }
    return this.clientPromise;
  }

  private async createClient(): Promise<LibsqlClientLike> {
    let sdk: unknown;
    try {
      sdk = await import('@libsql/client');
    } catch (error) {
      throw new DatabaseError('Remote SQLite with libsql requires the optional @libsql/client dependency.', {
        operation: 'LibsqlExecutor.createClient',
        retriable: false,
        original: error,
        suggestion: 'Install @libsql/client in your application: pnpm add @libsql/client'
      });
    }

    const createClient = (sdk as { createClient(config: Record<string, unknown>): LibsqlClientLike }).createClient;
    const clientConfig: Record<string, unknown> = {
      url: this.url,
      authToken: this.authToken
    };
    if (this.syncUrl) {
      clientConfig.syncUrl = this.syncUrl;
      if (this.syncInterval !== undefined) clientConfig.syncInterval = this.syncInterval;
    }
    return createClient(clientConfig);
  }
}
