import type { DatabaseSync as NodeSqliteDatabaseSync } from 'node:sqlite';

export interface CommandInput {
  Key?: string;
  Prefix?: string;
  Metadata?: Record<string, unknown>;
  ContentType?: string;
  Body?: unknown;
  ContentEncoding?: string;
  ContentLength?: number;
  IfMatch?: string;
  IfNoneMatch?: string;
  CopySource?: string;
  MetadataDirective?: 'COPY' | 'REPLACE';
  Delimiter?: string | null;
  MaxKeys?: number;
  ContinuationToken?: string | null;
  StartAfter?: string | null;
  Delete?: { Objects?: Array<{ Key: string }> };
}

export interface Command {
  constructor?: { name: string };
  name?: string;
  input?: CommandInput;
}

export interface DbRow {
  key: string;
  metadata: string;
  content_type: string;
  content_encoding: string | null;
  content_length: number;
  etag: string;
  last_modified: string;
  body: Buffer;
}

export interface DbObjectHeaderRow {
  key: string;
  metadata: string;
  content_type: string;
  content_encoding: string | null;
  content_length: number;
  etag: string;
  last_modified: string;
}

export interface DbObjectStateRow {
  content_length: number;
  etag: string;
}

export interface DbListRow {
  key: string;
  content_type: string;
  content_encoding: string | null;
  content_length: number;
  etag: string;
  last_modified: string;
}

export interface DbCountRow {
  total: number;
}

export interface DbBucketStatsRow {
  total_content_length: number;
}

export interface DbDeleteSummaryRow {
  total_objects: number;
  total_content_length: number;
}

export interface DbPartitionRow {
  key: string;
  metadata: string;
  content_type: string;
  etag: string;
  last_modified: string;
}

export type DbCopySourceRow = DbRow & {
  source: 'object' | 'partition';
};

export type SqlitePreparedStatement = ReturnType<NodeSqliteDatabaseSync['prepare']>;
