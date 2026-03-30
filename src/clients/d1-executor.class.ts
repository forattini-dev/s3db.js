import { DatabaseError } from '../errors.js';
import type { SqlExecutor, SqlExecutorResult, SqlExecutorResultRow } from './sql-executor.types.js';

interface D1ApiSuccess {
  success?: boolean;
  result?: unknown;
  errors?: Array<{ message?: string }>;
}

export class D1Executor implements SqlExecutor {
  private readonly endpoint: string;
  private readonly apiToken?: string;

  constructor(config: { endpoint: string; apiToken?: string }) {
    this.endpoint = config.endpoint;
    this.apiToken = config.apiToken;
  }

  async execute(sql: string, args: unknown[] = []): Promise<SqlExecutorResult> {
    const parsed = this.parseEndpoint(this.endpoint);

    if (parsed.kind === 'binding') {
      throw new DatabaseError('sqlite+d1://binding is not supported in this runtime yet.', {
        operation: 'D1Executor.execute',
        retriable: false,
        suggestion: 'Use sqlite+d1://<accountId>/<databaseId>?apiToken=... from Node.js, or provide a custom client for Worker bindings.'
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
