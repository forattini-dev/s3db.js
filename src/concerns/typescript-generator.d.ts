/**
 * TypeScript Definition Generator for s3db.js
 *
 * Automatically generates type-safe interfaces from your s3db.js resources.
 *
 * @module s3db.js/typescript-generator
 * @example
 * ```typescript
 * import { Database } from 's3db.js';
 * import { generateTypes } from 's3db.js/typescript-generator';
 *
 * const db = new Database({ connectionString: '...' });
 *
 * await db.createResource({
 *   name: 'users',
 *   attributes: {
 *     name: 'string|required',
 *     email: 'string|required|email',
 *     age: 'number'
 *   }
 * });
 *
 * // Generate TypeScript definitions
 * await generateTypes(db, { outputPath: './types/database.d.ts' });
 *
 * // Now you get full autocomplete!
 * import { Users } from './types/database';
 * const user: Users = await db.resources.users.get('id');
 * ```
 */

import type { Database } from 's3db.js';

/**
 * Options for generating TypeScript definitions
 */
export interface GenerateTypesOptions {
  /**
   * Output path for the generated .d.ts file
   * @example './types/database.d.ts'
   */
  outputPath: string;

  /**
   * Module name to augment with resource types
   * @default 's3db.js'
   */
  moduleName?: string;

  /**
   * Include JSDoc comments in generated types
   * @default true
   */
  includeComments?: boolean;

  /**
   * Custom header comment to add to generated file
   * @example 'Auto-generated types for MyApp database'
   */
  header?: string;

  /**
   * Include resource metadata in generated types
   * @default false
   */
  includeMetadata?: boolean;

  /**
   * Format style for generated code
   * @default 'prettier'
   */
  formatStyle?: 'prettier' | 'compact' | 'none';
}

/**
 * Result of type generation
 */
export interface GenerateTypesResult {
  /**
   * Number of resource interfaces generated
   */
  resourceCount: number;

  /**
   * List of generated resource names
   */
  resources: string[];

  /**
   * Output file path
   */
  outputPath: string;

  /**
   * Generated content (before writing to file)
   */
  content: string;
}

/**
 * Generate TypeScript definitions from database resources
 *
 * Creates a .d.ts file with type-safe interfaces for all resources in the database.
 * The generated file includes:
 * - Interface for each resource with all fields typed
 * - ResourceMap interface for type-safe db.resources access
 * - Module augmentation for s3db.js Database class
 *
 * @param database - s3db.js Database instance with resources
 * @param options - Generation options
 * @returns Promise<void>
 *
 * @throws {Error} If database has no resources
 * @throws {Error} If output directory doesn't exist
 *
 * @example
 * ```typescript
 * // Basic usage
 * await generateTypes(db, { outputPath: './types/db.d.ts' });
 *
 * // With custom options
 * await generateTypes(db, {
 *   outputPath: './types/db.d.ts',
 *   moduleName: 's3db.js',
 *   includeComments: true,
 *   header: 'Generated types for MyApp'
 * });
 * ```
 */
export function generateTypes(
  database: Database,
  options: GenerateTypesOptions
): Promise<void>;

/**
 * Map s3db.js field types to TypeScript types
 *
 * @param fieldType - s3db.js field type string (e.g., 'string|required', 'number', 'embedding:1536')
 * @returns TypeScript type string
 *
 * @internal
 *
 * @example
 * ```typescript
 * mapFieldTypeToTypeScript('string|required') // 'string'
 * mapFieldTypeToTypeScript('number') // 'number'
 * mapFieldTypeToTypeScript('embedding:1536') // 'number[] /* 1536 dimensions *\/'
 * ```
 */
export function mapFieldTypeToTypeScript(fieldType: string): string;

/**
 * Check if a field is optional based on its validation rules
 *
 * @param fieldType - s3db.js field type string
 * @returns True if field is optional (no 'required' rule)
 *
 * @internal
 */
export function isFieldOptional(fieldType: string): boolean;

/**
 * Generate JSDoc comment for a field
 *
 * @param fieldName - Name of the field
 * @param fieldType - s3db.js field type string
 * @returns JSDoc comment string
 *
 * @internal
 */
export function generateFieldComment(fieldName: string, fieldType: string): string;
