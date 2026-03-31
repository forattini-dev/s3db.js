export interface SqlExecutorResultRow {
  [key: string]: unknown;
}

export interface SqlExecutorResult {
  rows: SqlExecutorResultRow[];
}

export interface SqlExecutor {
  execute(sql: string, args?: unknown[]): Promise<SqlExecutorResult>;
  sync?(): Promise<void>;
  close?(): Promise<void> | void;
}
