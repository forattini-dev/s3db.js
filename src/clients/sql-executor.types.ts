export interface SqlExecutorResultRow {
  [key: string]: unknown;
}

export interface SqlExecutorResult {
  rows: SqlExecutorResultRow[];
}

export interface SqlExecutor {
  execute(sql: string, args?: unknown[]): Promise<SqlExecutorResult>;
  close?(): Promise<void> | void;
}
