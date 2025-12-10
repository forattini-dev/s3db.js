/**
 * Schema Sync Helper - Convert S3DB resource schemas to SQL DDL
 *
 * This module provides utilities to automatically create and sync database tables
 * based on S3DB resource schemas.
 */
export interface FieldParseResult {
    type: string;
    required: boolean;
    maxLength: number | null;
    options: {
        min?: number;
        max?: number;
        length?: number;
        [key: string]: unknown;
    };
}
export interface SchemaColumn {
    type: string;
    nullable?: boolean;
    maxLength?: number | null;
    mode?: string;
}
export interface SchemaDiff {
    missingColumns: string[];
    extraColumns: string[];
    typeMismatches: Array<{
        column: string;
        expected: string;
        actual: string;
    }>;
    hasChanges: boolean;
}
export interface BigQueryField {
    name: string;
    type: string;
    mode: 'REQUIRED' | 'NULLABLE';
}
interface PostgresClient {
    query(sql: string, params?: unknown[]): Promise<{
        rows: Array<Record<string, unknown>>;
    }>;
}
interface MySQLConnection {
    query(sql: string, params?: unknown[]): Promise<[Array<Record<string, unknown>>]>;
}
interface BigQueryClient {
    dataset(id: string): {
        table(id: string): {
            getMetadata(): Promise<[{
                schema?: {
                    fields?: BigQueryField[];
                };
            }]>;
        };
    };
}
export declare function parseFieldType(typeNotation: string | unknown): FieldParseResult;
export declare function s3dbTypeToPostgres(fieldType: string, fieldOptions?: Record<string, unknown>): string;
export declare function s3dbTypeToBigQuery(fieldType: string, fieldOptions?: Record<string, unknown>): string;
export declare function s3dbTypeToMySQL(fieldType: string, fieldOptions?: Record<string, unknown>): string;
export declare function generatePostgresCreateTable(tableName: string, attributes: Record<string, unknown>): string;
export declare function generateMySQLCreateTable(tableName: string, attributes: Record<string, unknown>): string;
export declare function getPostgresTableSchema(client: PostgresClient, tableName: string): Promise<Record<string, SchemaColumn> | null>;
export declare function getMySQLTableSchema(connection: MySQLConnection, tableName: string): Promise<Record<string, SchemaColumn> | null>;
export declare function compareSchemas(expectedSchema: Record<string, SchemaColumn>, actualSchema: Record<string, SchemaColumn>): SchemaDiff;
export declare function generatePostgresAlterTable(tableName: string, attributes: Record<string, unknown>, existingSchema: Record<string, SchemaColumn>): string[];
export declare function generateMySQLAlterTable(tableName: string, attributes: Record<string, unknown>, existingSchema: Record<string, SchemaColumn>): string[];
export declare function generateBigQuerySchema(attributes: Record<string, unknown>, mutability?: string): BigQueryField[];
export declare function getBigQueryTableSchema(bigqueryClient: BigQueryClient, datasetId: string, tableId: string): Promise<Record<string, SchemaColumn> | null>;
export declare function generateBigQuerySchemaUpdate(attributes: Record<string, unknown>, existingSchema: Record<string, SchemaColumn>, mutability?: string): BigQueryField[];
export declare function s3dbTypeToSQLite(fieldType: string, fieldOptions?: Record<string, unknown>): string;
export declare function generateSQLiteCreateTable(tableName: string, attributes: Record<string, unknown>): string;
export declare function generateSQLiteAlterTable(tableName: string, attributes: Record<string, unknown>, existingSchema: Record<string, SchemaColumn>): string[];
declare const _default: {
    parseFieldType: typeof parseFieldType;
    s3dbTypeToPostgres: typeof s3dbTypeToPostgres;
    s3dbTypeToMySQL: typeof s3dbTypeToMySQL;
    s3dbTypeToBigQuery: typeof s3dbTypeToBigQuery;
    s3dbTypeToSQLite: typeof s3dbTypeToSQLite;
    generatePostgresCreateTable: typeof generatePostgresCreateTable;
    generateMySQLCreateTable: typeof generateMySQLCreateTable;
    generateBigQuerySchema: typeof generateBigQuerySchema;
    generateSQLiteCreateTable: typeof generateSQLiteCreateTable;
    getPostgresTableSchema: typeof getPostgresTableSchema;
    getMySQLTableSchema: typeof getMySQLTableSchema;
    getBigQueryTableSchema: typeof getBigQueryTableSchema;
    compareSchemas: typeof compareSchemas;
    generatePostgresAlterTable: typeof generatePostgresAlterTable;
    generateMySQLAlterTable: typeof generateMySQLAlterTable;
    generateBigQuerySchemaUpdate: typeof generateBigQuerySchemaUpdate;
    generateSQLiteAlterTable: typeof generateSQLiteAlterTable;
};
export default _default;
//# sourceMappingURL=schema-sync.helper.d.ts.map