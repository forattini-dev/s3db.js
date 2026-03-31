import { DatabaseError } from '../errors.js';
import type { SqlExecutor, SqlExecutorResult, SqlExecutorResultRow, SqlStatement } from './sql-executor.types.js';

interface D1ApiSuccess {
  success?: boolean;
  result?: unknown;
  errors?: Array<{ message?: string }>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all(): Promise<{ results?: unknown[] }>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatement;
  batch?(statements: D1PreparedStatement[]): Promise<Array<{ results?: unknown[] }>>;
}

export class D1Executor implements SqlExecutor {
  private readonly endpoint: string;
  private readonly apiToken?: string;
  private readonly binding?: D1DatabaseLike;

  constructor(config: { endpoint: string; apiToken?: string; binding?: D1DatabaseLike }) {
    this.endpoint = config.endpoint;
    this.apiToken = config.apiToken;
    this.binding = config.binding;
  }

  async execute(sql: string, args: unknown[] = []): Promise<SqlExecutorResult> {
    if (this.binding) {
      return this.executeViaBinding(sql, args);
    }
    return this.executeViaHttp(sql, args);
  }

  async batch(statements: SqlStatement[]): Promise<SqlExecutorResult[]> {
    if (this.binding) {
      return this.batchViaBinding(statements);
    }
    return this.batchViaHttp(statements);
  }

  private async executeViaBinding(sql: string, args: unknown[]): Promise<SqlExecutorResult> {
    const result = await this.binding!.prepare(sql).bind(...args).all();
    return { rows: this.extractRowsFromBinding(result) };
  }

  private async batchViaBinding(statements: SqlStatement[]): Promise<SqlExecutorResult[]> {
    if (!this.binding!.batch) {
      const results: SqlExecutorResult[] = [];
      for (const stmt of statements) {
        results.push(await this.executeViaBinding(stmt.sql, stmt.args || []));
      }
      return results;
    }

    const prepared = statements.map(s => this.binding!.prepare(s.sql).bind(...(s.args || [])));
    const results = await this.binding!.batch(prepared);
    return results.map(r => ({ rows: this.extractRowsFromBinding(r) }));
  }

  private extractRowsFromBinding(result: { results?: unknown[] }): SqlExecutorResultRow[] {
    if (Array.isArray(result.results)) {
      return result.results.map(row => ({ ...(row as Record<string, unknown>) }));
    }
    return [];
  }

  private async executeViaHttp(sql: string, args: unknown[]): Promise<SqlExecutorResult> {
    const parsed = this.parseEndpoint(this.endpoint);

    if (parsed.kind === 'binding') {
      throw new DatabaseError('sqlite+d1://binding requires a D1 binding object passed via clientOptions.d1Binding.', {
        operation: 'D1Executor.execute',
        retriable: false,
        suggestion: 'Pass the D1 binding from your Worker env: new Database({ connectionString: "sqlite+d1://binding/DB", clientOptions: { d1Binding: env.DB } })'
      });
    }

    if (!this.apiToken) {
      throw new DatabaseError('Cloudflare D1 API token is required.', {
        operation: 'D1Executor.execute',
        retriable: false,
        suggestion: 'Provide ?apiToken=... in the sqlite+d1:// connection string.'
      });
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${parsed.accountId}/d1/database/${parsed.databaseId}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sql,
          params: args
        })
      }
    );

    if (!response.ok) {
      throw new DatabaseError(`Cloudflare D1 request failed with status ${response.status}`, {
        operation: 'D1Executor.execute',
        statusCode: response.status,
        retriable: response.status >= 500,
        suggestion: 'Check the D1 account ID, database ID, API token, and SQL payload.'
      });
    }

    const payload = await response.json() as D1ApiSuccess;
    if (payload.success === false) {
      const message = payload.errors?.map(error => error.message).filter(Boolean).join('; ') || 'Cloudflare D1 query failed';
      throw new DatabaseError(message, {
        operation: 'D1Executor.execute',
        retriable: false,
        suggestion: 'Check the SQL statement and D1 credentials.'
      });
    }

    const rows = this.extractRows(payload.result);
    return { rows };
  }

  private async batchViaHttp(statements: SqlStatement[]): Promise<SqlExecutorResult[]> {
    const parsed = this.parseEndpoint(this.endpoint);

    if (parsed.kind === 'binding') {
      throw new DatabaseError('sqlite+d1://binding requires a D1 binding object.', {
        operation: 'D1Executor.batch',
        retriable: false,
        suggestion: 'Pass the D1 binding via clientOptions.d1Binding.'
      });
    }

    if (!this.apiToken) {
      throw new DatabaseError('Cloudflare D1 API token is required.', {
        operation: 'D1Executor.batch',
        retriable: false,
        suggestion: 'Provide ?apiToken=... in the sqlite+d1:// connection string.'
      });
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${parsed.accountId}/d1/database/${parsed.databaseId}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(
          statements.map(s => ({ sql: s.sql, params: s.args || [] }))
        )
      }
    );

    if (!response.ok) {
      throw new DatabaseError(`Cloudflare D1 batch request failed with status ${response.status}`, {
        operation: 'D1Executor.batch',
        statusCode: response.status,
        retriable: response.status >= 500,
        suggestion: 'Check the D1 account ID, database ID, API token, and SQL payload.'
      });
    }

    const payload = await response.json() as unknown;
    if (Array.isArray(payload)) {
      return payload.map(item => ({ rows: this.extractRows((item as D1ApiSuccess).result) }));
    }

    const single = payload as D1ApiSuccess;
    if (single.success === false) {
      const message = single.errors?.map(error => error.message).filter(Boolean).join('; ') || 'Cloudflare D1 batch failed';
      throw new DatabaseError(message, {
        operation: 'D1Executor.batch',
        retriable: false,
        suggestion: 'Check the SQL statements and D1 credentials.'
      });
    }

    if (Array.isArray(single.result)) {
      return single.result.map(item => ({ rows: this.extractRows(item) }));
    }

    return [{ rows: this.extractRows(single.result) }];
  }

  private extractRows(result: unknown): SqlExecutorResultRow[] {
    if (Array.isArray(result)) {
      for (const item of result) {
        if (item && typeof item === 'object' && Array.isArray((item as { results?: unknown[] }).results)) {
          return ((item as { results: unknown[] }).results).map(row => ({ ...(row as Record<string, unknown>) }));
        }
      }
      return result.map(row => ({ ...(row as Record<string, unknown>) }));
    }

    if (result && typeof result === 'object' && Array.isArray((result as { results?: unknown[] }).results)) {
      return ((result as { results: unknown[] }).results).map(row => ({ ...(row as Record<string, unknown>) }));
    }

    return [];
  }

  private parseEndpoint(endpoint: string): { kind: 'binding'; binding: string } | { kind: 'http'; accountId: string; databaseId: string } {
    const url = new URL(endpoint);
    const pathname = url.pathname.replace(/^\/+/, '');

    if (url.hostname === 'binding') {
      const binding = pathname.split('/').filter(Boolean)[0];
      if (!binding) {
        throw new DatabaseError('sqlite+d1://binding requires a binding name.', {
          operation: 'D1Executor.parseEndpoint',
          retriable: false,
          suggestion: 'Use sqlite+d1://binding/DB.'
        });
      }
      return { kind: 'binding', binding };
    }

    const databaseId = pathname.split('/').filter(Boolean)[0];
    if (!url.hostname || !databaseId) {
      throw new DatabaseError('sqlite+d1:// requires accountId and databaseId.', {
        operation: 'D1Executor.parseEndpoint',
        retriable: false,
        suggestion: 'Use sqlite+d1://<accountId>/<databaseId>?apiToken=...'
      });
    }

    return {
      kind: 'http',
      accountId: url.hostname,
      databaseId
    };
  }
}
