import type { SchemaDescriptor } from 'raffel';

export type ApiRouteKind =
  | 'root'
  | 'resource'
  | 'resource-custom'
  | 'auth'
  | 'relation'
  | 'plugin-custom'
  | 'static'
  | 'metrics'
  | 'admin'
  | 'docs'
  | 'health';

export type ApiRouteSourceKind =
  | 'programmatic'
  | 'rest-resource'
  | 'resource'
  | 'unknown';

export interface ApiRouteAuthMetadata {
  required?: boolean;
  mode?: 'required' | 'optional';
  drivers?: string[];
  roles?: string[];
  scopes?: string[];
}

export interface ApiRouteSchemaMetadata {
  input?: SchemaDescriptor | null;
  output?: SchemaDescriptor | null;
}

export interface ApiRouteRegistryEntry {
  kind: ApiRouteKind;
  path: string;
  methods: string[];
  resource?: string;
  relation?: string;
  authEnabled?: boolean;
  authConfig?: boolean | string[];
  originalKey?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  sourceKind?: ApiRouteSourceKind;
  sourceLocation?: string;
  auth?: ApiRouteAuthMetadata;
  schema?: ApiRouteSchemaMetadata;
  deprecated?: boolean;
}

function normalizeMethods(methods: string[]): string[] {
  return Array.from(new Set(
    methods
      .filter((method): method is string => typeof method === 'string' && method.trim().length > 0)
      .map((method) => method.trim().toUpperCase())
  ));
}

export class ApiRouteRegistry {
  private entries: ApiRouteRegistryEntry[] = [];

  register(entry: ApiRouteRegistryEntry): void {
    const normalizedEntry: ApiRouteRegistryEntry = {
      ...entry,
      methods: normalizeMethods(entry.methods)
    };

    const key = this.buildKey(normalizedEntry);
    const existingIndex = this.entries.findIndex((candidate) => this.buildKey(candidate) === key);

    if (existingIndex >= 0) {
      this.entries[existingIndex] = normalizedEntry;
      return;
    }

    this.entries.push(normalizedEntry);
  }

  registerMany(entries: ApiRouteRegistryEntry[]): void {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  list(): ApiRouteRegistryEntry[] {
    return this.entries.map((entry) => ({
      ...entry,
      methods: entry.methods.slice(),
      tags: entry.tags?.slice(),
      auth: entry.auth ? {
        ...entry.auth,
        drivers: entry.auth.drivers?.slice(),
        roles: entry.auth.roles?.slice(),
        scopes: entry.auth.scopes?.slice()
      } : undefined,
      schema: entry.schema ? {
        input: entry.schema.input ? {
          ...entry.schema.input,
          jsonSchema: { ...entry.schema.input.jsonSchema },
          diagnostics: entry.schema.input.diagnostics.slice()
        } : entry.schema.input,
        output: entry.schema.output ? {
          ...entry.schema.output,
          jsonSchema: { ...entry.schema.output.jsonSchema },
          diagnostics: entry.schema.output.diagnostics.slice()
        } : entry.schema.output
      } : undefined
    }));
  }

  clear(): void {
    this.entries = [];
  }

  private buildKey(entry: ApiRouteRegistryEntry): string {
    return [
      entry.kind,
      entry.path,
      entry.methods.join(','),
      entry.resource || '',
      entry.relation || '',
      entry.originalKey || '',
      entry.operationId || ''
    ].join('::');
  }
}
