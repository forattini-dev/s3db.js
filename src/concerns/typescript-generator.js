/**
 * TypeScript Definition Generator
 *
 * Generates .d.ts files from s3db.js resource schemas for type safety and autocomplete.
 *
 * Usage:
 *   import { generateTypes } from 's3db.js/typescript-generator';
 *   await generateTypes(database, { outputPath: './types/database.d.ts' });
 *
 * Features:
 * - Auto-generates TypeScript interfaces from resource schemas
 * - Type-safe property access (db.resources.users)
 * - Autocomplete for resource methods
 * - Detects typos at compile time (user.emai → error!)
 */

import { createLogger } from './logger.js';

// Module-level logger for TypeScript generation
const logger = createLogger({ name: 'TypeScriptGenerator', level: 'info' });

import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

/**
 * Map s3db.js field types to TypeScript types
 * @param {string} fieldType - s3db.js field type
 * @returns {string} TypeScript type
 */
function mapFieldTypeToTypeScript(fieldType) {
  // Extract base type from validation rules (e.g., "string|required" → "string")
  const baseType = fieldType.split('|')[0].trim();

  const typeMap = {
    'string': 'string',
    'number': 'number',
    'integer': 'number',
    'boolean': 'boolean',
    'array': 'any[]',
    'object': 'Record<string, any>',
    'json': 'Record<string, any>',
    'secret': 'string',
    'email': 'string',
    'url': 'string',
    'date': 'string', // ISO date string
    'datetime': 'string', // ISO datetime string
    'ip4': 'string',
    'ip6': 'string',
  };

  // Handle embedding:N notation
  if (baseType.startsWith('embedding:')) {
    const dimensions = parseInt(baseType.split(':')[1]);
    return `number[] /* ${dimensions} dimensions */`;
  }

  return typeMap[baseType] || 'any';
}

/**
 * Check if field is required based on validation rules
 * @param {string} fieldDef - Field definition
 * @returns {boolean} True if required
 */
function isFieldRequired(fieldDef) {
  if (typeof fieldDef === 'string') {
    return fieldDef.includes('|required');
  }
  if (typeof fieldDef === 'object' && fieldDef.required) {
    return true;
  }
  return false;
}

/**
 * Generate TypeScript interface for a resource
 * @param {string} resourceName - Resource name
 * @param {Object} attributes - Resource attributes
 * @param {boolean} timestamps - Whether timestamps are enabled
 * @returns {string} TypeScript interface definition
 */
function generateResourceInterface(resourceName, attributes, timestamps = false) {
  const interfaceName = toPascalCase(resourceName);
  const lines = [];

  lines.push(`export interface ${interfaceName} {`);

  // Add id field (always present)
  lines.push(`  /** Resource ID (auto-generated) */`);
  lines.push(`  id: string;`);
  lines.push('');

  // Add user-defined attributes
  for (const [fieldName, fieldDef] of Object.entries(attributes)) {
    const required = isFieldRequired(fieldDef);
    const optional = required ? '' : '?';

    // Extract type
    let tsType;
    if (typeof fieldDef === 'string') {
      tsType = mapFieldTypeToTypeScript(fieldDef);
    } else if (typeof fieldDef === 'object' && fieldDef.type) {
      tsType = mapFieldTypeToTypeScript(fieldDef.type);

      // Handle nested objects
      if (fieldDef.type === 'object' && fieldDef.props) {
        tsType = '{\n';
        for (const [propName, propDef] of Object.entries(fieldDef.props)) {
          const propType = typeof propDef === 'string'
            ? mapFieldTypeToTypeScript(propDef)
            : mapFieldTypeToTypeScript(propDef.type);
          const propRequired = isFieldRequired(propDef);
          tsType += `    ${propName}${propRequired ? '' : '?'}: ${propType};\n`;
        }
        tsType += '  }';
      }

      // Handle arrays with typed items
      if (fieldDef.type === 'array' && fieldDef.items) {
        const itemType = mapFieldTypeToTypeScript(fieldDef.items);
        tsType = `Array<${itemType}>`;
      }
    } else {
      tsType = 'any';
    }

    // Add JSDoc comment if description exists
    if (fieldDef.description) {
      lines.push(`  /** ${fieldDef.description} */`);
    }

    lines.push(`  ${fieldName}${optional}: ${tsType};`);
  }

  // Add timestamp fields if enabled
  if (timestamps) {
    lines.push('');
    lines.push(`  /** Creation timestamp (ISO 8601) */`);
    lines.push(`  createdAt: string;`);
    lines.push(`  /** Last update timestamp (ISO 8601) */`);
    lines.push(`  updatedAt: string;`);
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

/**
 * Convert string to PascalCase
 * @param {string} str - String to convert
 * @returns {string} PascalCase string
 */
function toPascalCase(str) {
  return str
    .split(/[_-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Generate TypeScript definitions for all resources
 * @param {Database} database - s3db.js Database instance
 * @param {Object} options - Generation options
 * @param {string} options.outputPath - Output file path (default: ./types/database.d.ts)
 * @param {string} options.moduleName - Module name for import (default: s3db.js)
 * @param {boolean} options.includeResource - Include Resource class methods (default: true)
 * @returns {Promise<string>} Generated TypeScript definitions
 */
export async function generateTypes(database, options = {}) {
  const {
    outputPath = './types/database.d.ts',
    moduleName = 's3db.js',
    includeResource = true
  } = options;

  const lines = [];

  // File header
  lines.push('/**');
  lines.push(' * Auto-generated TypeScript definitions for s3db.js resources');
  lines.push(' * Generated at: ' + new Date().toISOString());
  lines.push(' * DO NOT EDIT - This file is auto-generated');
  lines.push(' */');
  lines.push('');

  // Import base types from s3db.js
  if (includeResource) {
    lines.push(`import { Resource, Database } from '${moduleName}';`);
    lines.push('');
  }

  // Generate interfaces for each resource
  const resourceInterfaces = [];

  for (const [name, resource] of Object.entries(database.resources)) {
    const allAttributes = resource.config?.attributes || resource.attributes || {};
    const timestamps = resource.config?.timestamps || false;

    // Filter out plugin attributes - they are internal implementation details
    // and should not be exposed in public TypeScript interfaces
    const pluginAttrNames = resource.schema?._pluginAttributes
      ? Object.values(resource.schema._pluginAttributes).flat()
      : [];

    const userAttributes = Object.fromEntries(
      Object.entries(allAttributes).filter(([name]) => !pluginAttrNames.includes(name))
    );

    const interfaceDef = generateResourceInterface(name, userAttributes, timestamps);
    lines.push(interfaceDef);

    resourceInterfaces.push({
      name,
      interfaceName: toPascalCase(name),
      resource
    });
  }

  // Generate ResourceMap interface for db.resources
  lines.push('/**');
  lines.push(' * Typed resource map for property access');
  lines.push(' * @example');
  lines.push(' * const users = db.resources.users; // Type-safe!');
  lines.push(' * const user = await users.get("id"); // Autocomplete works!');
  lines.push(' */');
  lines.push('export interface ResourceMap {');

  for (const { name, interfaceName } of resourceInterfaces) {
    lines.push(`  /** ${interfaceName} resource */`);
    if (includeResource) {
      lines.push(`  ${name}: Resource<${interfaceName}>;`);
    } else {
      lines.push(`  ${name}: any;`);
    }
  }

  lines.push('}');
  lines.push('');

  // Generate Database extension with typed resources property
  if (includeResource) {
    lines.push('/**');
    lines.push(' * Extended Database class with typed resources');
    lines.push(' */');
    lines.push('declare module \'s3db.js\' {');
    lines.push('  interface Database {');
    lines.push('    resources: ResourceMap;');
    lines.push('  }');
    lines.push('');
    lines.push('  interface Resource<T = any> {');
    lines.push('    get(id: string): Promise<T>;');
    lines.push('    getOrNull(id: string): Promise<T | null>;');
    lines.push('    getOrThrow(id: string): Promise<T>;');
    lines.push('    insert(data: Partial<T>): Promise<T>;');
    lines.push('    update(id: string, data: Partial<T>): Promise<T>;');
    lines.push('    patch(id: string, data: Partial<T>): Promise<T>;');
    lines.push('    replace(id: string, data: Partial<T>): Promise<T>;');
    lines.push('    delete(id: string): Promise<void>;');
    lines.push('    list(options?: any): Promise<T[]>;');
    lines.push('    query(filters: Partial<T>, options?: any): Promise<T[]>;');
    lines.push('    validate(data: Partial<T>, options?: any): Promise<{ valid: boolean; errors: any[]; data: T | null }>;');
    lines.push('  }');
    lines.push('}');
  }

  const content = lines.join('\n');

  // Write to file if outputPath provided
  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf-8');
  }

  return content;
}

/**
 * Generate types and log to console
 * @param {Database} database - s3db.js Database instance
 * @param {Object} options - Generation options
 */
export async function printTypes(database, options = {}) {
  const types = await generateTypes(database, { ...options, outputPath: null });
  if (options && (options.logLevel === 'debug' || options.logLevel === 'trace')) {
    logger.info({ types }, 'Generated TypeScript definitions');
  }
  return types;
}

export default { generateTypes, printTypes };
