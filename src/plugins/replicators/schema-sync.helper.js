/**
 * Schema Sync Helper - Convert S3DB resource schemas to SQL DDL
 *
 * This module provides utilities to automatically create and sync database tables
 * based on S3DB resource schemas.
 */

import tryFn from "#src/concerns/try-fn.js";

/**
 * Parse s3db field type notation (e.g., 'string|required|maxlength:50')
 */
export function parseFieldType(typeNotation) {
  if (typeof typeNotation !== 'string') {
    return { type: 'string', required: false, maxLength: null, options: {} };
  }

  const parts = typeNotation.split('|');
  const baseType = parts[0];
  const options = {};
  let required = false;
  let maxLength = null;

  for (const part of parts.slice(1)) {
    if (part === 'required') {
      required = true;
    } else if (part.startsWith('maxlength:')) {
      maxLength = parseInt(part.split(':')[1]);
    } else if (part.startsWith('min:')) {
      options.min = parseFloat(part.split(':')[1]);
    } else if (part.startsWith('max:')) {
      options.max = parseFloat(part.split(':')[1]);
    } else if (part.startsWith('length:')) {
      options.length = parseInt(part.split(':')[1]);
    }
  }

  return { type: baseType, required, maxLength, options };
}

/**
 * Convert S3DB type to PostgreSQL type
 */
export function s3dbTypeToPostgres(fieldType, fieldOptions = {}) {
  const { type, maxLength, options } = parseFieldType(fieldType);

  switch (type) {
    case 'string':
      if (maxLength) return `VARCHAR(${maxLength})`;
      return 'TEXT';

    case 'number':
      if (options.min !== undefined && options.min >= 0 && options.max !== undefined && options.max <= 2147483647) {
        return 'INTEGER';
      }
      return 'DOUBLE PRECISION';

    case 'boolean':
      return 'BOOLEAN';

    case 'object':
    case 'json':
      return 'JSONB';

    case 'array':
      return 'JSONB';

    case 'embedding':
      // Vector embeddings - store as JSONB or use pgvector extension
      return 'JSONB';

    case 'ip4':
    case 'ip6':
      return 'INET';

    case 'secret':
      return 'TEXT';

    case 'uuid':
      return 'UUID';

    case 'date':
    case 'datetime':
      return 'TIMESTAMP WITH TIME ZONE';

    default:
      return 'TEXT';
  }
}

/**
 * Convert S3DB type to MySQL type
 */
export function s3dbTypeToMySQL(fieldType, fieldOptions = {}) {
  const { type, maxLength, options } = parseFieldType(fieldType);

  switch (type) {
    case 'string':
      if (maxLength && maxLength <= 255) return `VARCHAR(${maxLength})`;
      return 'TEXT';

    case 'number':
      if (options.min !== undefined && options.min >= 0 && options.max !== undefined && options.max <= 2147483647) {
        return 'INT';
      }
      return 'DOUBLE';

    case 'boolean':
      return 'TINYINT(1)';

    case 'object':
    case 'json':
    case 'array':
      return 'JSON';

    case 'embedding':
      return 'JSON';

    case 'ip4':
      return 'VARCHAR(15)';

    case 'ip6':
      return 'VARCHAR(45)';

    case 'secret':
      return 'TEXT';

    case 'uuid':
      return 'CHAR(36)';

    case 'date':
    case 'datetime':
      return 'DATETIME';

    default:
      return 'TEXT';
  }
}

/**
 * Generate PostgreSQL CREATE TABLE statement from S3DB resource schema
 */
export function generatePostgresCreateTable(tableName, attributes) {
  const columns = [];

  // Always add id as primary key
  columns.push('id VARCHAR(255) PRIMARY KEY');

  for (const [fieldName, fieldConfig] of Object.entries(attributes)) {
    if (fieldName === 'id') continue; // Skip id, already added

    const fieldType = typeof fieldConfig === 'string' ? fieldConfig : fieldConfig.type;
    const { required } = parseFieldType(fieldType);

    const sqlType = s3dbTypeToPostgres(fieldType);
    const nullConstraint = required ? 'NOT NULL' : 'NULL';

    columns.push(`"${fieldName}" ${sqlType} ${nullConstraint}`);
  }

  // Add timestamps if they exist in attributes
  if (!attributes.createdAt) {
    columns.push('created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
  }
  if (!attributes.updatedAt) {
    columns.push('updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
  }

  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${columns.join(',\n  ')}\n)`;
}

/**
 * Generate MySQL CREATE TABLE statement from S3DB resource schema
 */
export function generateMySQLCreateTable(tableName, attributes) {
  const columns = [];

  // Always add id as primary key
  columns.push('id VARCHAR(255) PRIMARY KEY');

  for (const [fieldName, fieldConfig] of Object.entries(attributes)) {
    if (fieldName === 'id') continue;

    const fieldType = typeof fieldConfig === 'string' ? fieldConfig : fieldConfig.type;
    const { required } = parseFieldType(fieldType);

    const sqlType = s3dbTypeToMySQL(fieldType);
    const nullConstraint = required ? 'NOT NULL' : 'NULL';

    columns.push(`\`${fieldName}\` ${sqlType} ${nullConstraint}`);
  }

  // Add timestamps
  if (!attributes.createdAt) {
    columns.push('created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  }
  if (!attributes.updatedAt) {
    columns.push('updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  }

  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${columns.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
}

/**
 * Get existing table schema from PostgreSQL
 */
export async function getPostgresTableSchema(client, tableName) {
  const [ok, err, result] = await tryFn(async () => {
    return await client.query(`
      SELECT column_name, data_type, is_nullable, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
  });

  if (!ok) return null;

  const schema = {};
  for (const row of result.rows) {
    schema[row.column_name] = {
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      maxLength: row.character_maximum_length
    };
  }

  return schema;
}

/**
 * Get existing table schema from MySQL
 */
export async function getMySQLTableSchema(connection, tableName) {
  const [ok, err, [rows]] = await tryFn(async () => {
    return await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [tableName]);
  });

  if (!ok) return null;

  const schema = {};
  for (const row of rows) {
    schema[row.COLUMN_NAME] = {
      type: row.DATA_TYPE,
      nullable: row.IS_NULLABLE === 'YES',
      maxLength: row.CHARACTER_MAXIMUM_LENGTH
    };
  }

  return schema;
}

/**
 * Compare two schemas and return differences
 */
export function compareSchemas(expectedSchema, actualSchema) {
  const missingColumns = [];
  const extraColumns = [];
  const typeMismatches = [];

  // Find missing columns
  for (const column of Object.keys(expectedSchema)) {
    if (!actualSchema[column]) {
      missingColumns.push(column);
    }
  }

  // Find extra columns
  for (const column of Object.keys(actualSchema)) {
    if (!expectedSchema[column]) {
      extraColumns.push(column);
    }
  }

  // Find type mismatches (simplified - just check if types exist)
  for (const column of Object.keys(expectedSchema)) {
    if (actualSchema[column] && actualSchema[column].type !== expectedSchema[column].type) {
      typeMismatches.push({
        column,
        expected: expectedSchema[column].type,
        actual: actualSchema[column].type
      });
    }
  }

  return {
    missingColumns,
    extraColumns,
    typeMismatches,
    hasChanges: missingColumns.length > 0 || extraColumns.length > 0 || typeMismatches.length > 0
  };
}

/**
 * Generate ALTER TABLE statements for PostgreSQL
 */
export function generatePostgresAlterTable(tableName, attributes, existingSchema) {
  const alterStatements = [];

  for (const [fieldName, fieldConfig] of Object.entries(attributes)) {
    if (fieldName === 'id') continue;
    if (existingSchema[fieldName]) continue; // Column exists

    const fieldType = typeof fieldConfig === 'string' ? fieldConfig : fieldConfig.type;
    const { required } = parseFieldType(fieldType);
    const sqlType = s3dbTypeToPostgres(fieldType);
    const nullConstraint = required ? 'NOT NULL' : 'NULL';

    alterStatements.push(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS "${fieldName}" ${sqlType} ${nullConstraint}`);
  }

  return alterStatements;
}

/**
 * Generate ALTER TABLE statements for MySQL
 */
export function generateMySQLAlterTable(tableName, attributes, existingSchema) {
  const alterStatements = [];

  for (const [fieldName, fieldConfig] of Object.entries(attributes)) {
    if (fieldName === 'id') continue;
    if (existingSchema[fieldName]) continue;

    const fieldType = typeof fieldConfig === 'string' ? fieldConfig : fieldConfig.type;
    const { required } = parseFieldType(fieldType);
    const sqlType = s3dbTypeToMySQL(fieldType);
    const nullConstraint = required ? 'NOT NULL' : 'NULL';

    alterStatements.push(`ALTER TABLE ${tableName} ADD COLUMN \`${fieldName}\` ${sqlType} ${nullConstraint}`);
  }

  return alterStatements;
}

export default {
  parseFieldType,
  s3dbTypeToPostgres,
  s3dbTypeToMySQL,
  generatePostgresCreateTable,
  generateMySQLCreateTable,
  getPostgresTableSchema,
  getMySQLTableSchema,
  compareSchemas,
  generatePostgresAlterTable,
  generateMySQLAlterTable
};
