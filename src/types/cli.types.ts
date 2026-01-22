/**
 * CLI Configuration stored in ~/.s3db/config.json
 */
export interface CLIConfig {
  connection?: string;
  defaultBehavior?: string;
  testConnection?: string;
  testName?: string;
}

/**
 * CLI Table data for rendering
 */
export interface CLITableData {
  head: string[];
  rows: any[][];
}
