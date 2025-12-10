export interface CLIOptions {
  connection?: string;
  limit?: number;
  filter?: string;
  partition?: string;
  csv?: boolean;
  json?: boolean;
  data?: string;
  file?: string;
  force?: boolean;
  name?: string;
  schema?: string;
  behavior?: string;
  timestamps?: boolean;
  paranoid?: boolean;
  format?: 'json' | 'typescript' | 'bigquery';
  dir?: string;
  by?: string;
  step?: number;
  all?: boolean;
  quiet?: boolean;
  count?: number | string;
  fixtures?: string;
  config?: any; // For commander
}

export interface CLIConfig {
  connection?: string;
  defaultBehavior?: string;
  testConnection?: string;
  testName?: string;
}

export interface CLITableData {
  head: string[];
  rows: any[][];
}