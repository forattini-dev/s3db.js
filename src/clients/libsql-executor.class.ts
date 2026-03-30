import { DatabaseError } from '../errors.js';
import type { SqlExecutor, SqlExecutorResult, SqlExecutorResultRow } from './sql-executor.types.js';

interface LibsqlClientLike {
  execute(input: string | { sql: string; args?: unknown[] }): Promise<{ rows?: unknown[] }>;
  close(): void;
}

export class LibsqlExecutor implements SqlExecutor {
  private readonly url: string;
  private readonly authToken?: string;
  private clientPromise: Promise<LibsqlClientLike> | null = null;

  constructor(config: { url: string; authToken?: string }) {
    this.url = config.url;
    this.authToken = config.authToken;
  }

  async execute(sql: string, args: unknown[] = []): Promise<SqlExecutorResult> {
    const client = await this.getClient();
    const result = await client.execute({ sql, args });
    const rows = Array.isArray(result.rows)
      ? result.rows.map(row => ({ ...(row as Record<string, unknown>) }) as SqlExecutorResultRow)
      : [];
    return { rows };
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

    const createClient = (sdk as { createClient(config: { url: string; authToken?: string }): LibsqlClientLike }).createClient;
    return createClient({
      url: this.url,
      authToken: this.authToken
    });
  }
}
