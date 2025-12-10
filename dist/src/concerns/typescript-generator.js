import { createLogger } from './logger.js';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
const logger = createLogger({ name: 'TypeScriptGenerator', level: 'info' });
function mapFieldTypeToTypeScript(fieldType) {
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
        'date': 'string',
        'datetime': 'string',
        'ip4': 'string',
        'ip6': 'string',
    };
    if (baseType.startsWith('embedding:')) {
        const dimensions = parseInt(baseType.split(':')[1]);
        return `number[] /* ${dimensions} dimensions */`;
    }
    return typeMap[baseType] || 'any';
}
function isFieldRequired(fieldDef) {
    if (typeof fieldDef === 'string') {
        return fieldDef.includes('|required');
    }
    if (typeof fieldDef === 'object' && fieldDef.required) {
        return true;
    }
    return false;
}
function generateResourceInterface(resourceName, attributes, timestamps = false) {
    const interfaceName = toPascalCase(resourceName);
    const lines = [];
    lines.push(`export interface ${interfaceName} {`);
    lines.push(`  /** Resource ID (auto-generated) */`);
    lines.push(`  id: string;`);
    lines.push('');
    for (const [fieldName, fieldDef] of Object.entries(attributes)) {
        const required = isFieldRequired(fieldDef);
        const optional = required ? '' : '?';
        let tsType;
        if (typeof fieldDef === 'string') {
            tsType = mapFieldTypeToTypeScript(fieldDef);
        }
        else if (typeof fieldDef === 'object' && fieldDef.type) {
            tsType = mapFieldTypeToTypeScript(fieldDef.type);
            if (fieldDef.type === 'object' && fieldDef.props) {
                tsType = '{\n';
                for (const [propName, propDef] of Object.entries(fieldDef.props)) {
                    const propType = typeof propDef === 'string'
                        ? mapFieldTypeToTypeScript(propDef)
                        : mapFieldTypeToTypeScript(propDef.type || 'any');
                    const propRequired = isFieldRequired(propDef);
                    tsType += `    ${propName}${propRequired ? '' : '?'}: ${propType};\n`;
                }
                tsType += '  }';
            }
            if (fieldDef.type === 'array' && fieldDef.items) {
                const itemType = typeof fieldDef.items === 'string'
                    ? mapFieldTypeToTypeScript(fieldDef.items)
                    : mapFieldTypeToTypeScript(fieldDef.items.type || 'any');
                tsType = `Array<${itemType}>`;
            }
        }
        else {
            tsType = 'any';
        }
        if (typeof fieldDef === 'object' && fieldDef.description) {
            lines.push(`  /** ${fieldDef.description} */`);
        }
        lines.push(`  ${fieldName}${optional}: ${tsType};`);
    }
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
function toPascalCase(str) {
    return str
        .split(/[_-]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
}
export async function generateTypes(database, options = {}) {
    const { outputPath = './types/database.d.ts', moduleName = 's3db.js', includeResource = true } = options;
    const lines = [];
    lines.push('/**');
    lines.push(' * Auto-generated TypeScript definitions for s3db.js resources');
    lines.push(' * Generated at: ' + new Date().toISOString());
    lines.push(' * DO NOT EDIT - This file is auto-generated');
    lines.push(' */');
    lines.push('');
    if (includeResource) {
        lines.push(`import { Resource, Database } from '${moduleName}';`);
        lines.push('');
    }
    const resourceInterfaces = [];
    for (const [name, resource] of Object.entries(database.resources)) {
        const allAttributes = resource.config?.attributes || resource.attributes || {};
        const timestamps = resource.config?.timestamps || false;
        const pluginAttrNames = resource.schema?._pluginAttributes
            ? Object.values(resource.schema._pluginAttributes).flat()
            : [];
        const userAttributes = Object.fromEntries(Object.entries(allAttributes).filter(([attrName]) => !pluginAttrNames.includes(attrName)));
        const interfaceDef = generateResourceInterface(name, userAttributes, timestamps);
        lines.push(interfaceDef);
        resourceInterfaces.push({
            name,
            interfaceName: toPascalCase(name),
            resource
        });
    }
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
        }
        else {
            lines.push(`  ${name}: any;`);
        }
    }
    lines.push('}');
    lines.push('');
    if (includeResource) {
        lines.push('/**');
        lines.push(' * Extended Database class with typed resources');
        lines.push(' */');
        lines.push("declare module 's3db.js' {");
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
    if (outputPath) {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, content, 'utf-8');
    }
    return content;
}
export async function printTypes(database, options = {}) {
    const types = await generateTypes(database, { ...options, outputPath: null });
    if (options && (options.logLevel === 'debug' || options.logLevel === 'trace')) {
        logger.info({ types }, 'Generated TypeScript definitions');
    }
    return types;
}
export default { generateTypes, printTypes };
//# sourceMappingURL=typescript-generator.js.map