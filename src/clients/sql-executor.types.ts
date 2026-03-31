export interface SqlExecutorResultRow {
  [key: string]: unknown;
}

export interface SqlExecutorResult {
  rows: SqlExecutorResultRow[];
}

export interface SqlStatement {
  sql: string;
  args?: unknown[];
}

export interface SqlExecutor {
  execute(sql: string, args?: unknown[]): Promise<SqlExecutorResult>;
  batch?(statements: SqlStatement[]): Promise<SqlExecutorResult[]>;
  sync?(): Promise<void>;
  close?(): Promise<void> | void;
}
