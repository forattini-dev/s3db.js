import { checkGuard, type Guard } from './guards.js';

export interface ApiUserLike {
  role?: string;
  roles?: string[];
  scopes?: string[];
  scope?: string | string[];
  [key: string]: unknown;
}

export interface ProtectedFieldRule {
  path?: string;
  field?: string;
  whenRole?: string | string[];
  unlessRole?: string | string[];
  whenScope?: string | string[];
  unlessScope?: string | string[];
}

export type ProtectedFieldsConfig =
  | string[]
  | Array<string | ProtectedFieldRule>
  | null
  | undefined;

export interface AccessConditionRule {
  guard?: Guard;
  whenRole?: string | string[];
  unlessRole?: string | string[];
  whenScope?: string | string[];
  unlessScope?: string | string[];
  auto?: boolean;
  default?: boolean;
  priority?: number;
}

export interface ViewDefinition extends AccessConditionRule {
  fields?: string[];
  omit?: string[];
  protected?: ProtectedFieldsConfig;
}

export interface WriteOperationPolicy extends AccessConditionRule {
  readonly?: string[];
  readOnly?: string[];
  writable?: string[];
  allow?: string[];
  deny?: string[];
}

export type WritePolicyConfig = WriteOperationPolicy | WriteOperationPolicy[];

export interface BulkCreatePolicyConfig {
  enabled?: boolean;
  path?: string;
  maxItems?: number;
  mode?: 'partial' | 'all-or-nothing';
}

export interface ApiPolicyConfig {
  protected?: ProtectedFieldsConfig;
  views?: Record<string, ViewDefinition>;
  writable?: string[];
  readonly?: string[];
  readOnly?: string[];
  write?: {
    create?: WritePolicyConfig;
    update?: WritePolicyConfig;
    patch?: WritePolicyConfig;
  };
  bulk?: {
    create?: boolean | BulkCreatePolicyConfig;
  };
  [key: string]: unknown;
}

export interface ViewResolutionSuccess {
  ok: true;
  definition: ViewDefinition | null;
  name: string | null;
}

export interface ViewResolutionError {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface WritePolicyResult {
  ok: boolean;
  rejectedPaths: string[];
  readonlyPaths: string[];
  writablePaths: string[] | null;
}

function normalizeList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  return [String(value).trim()].filter(Boolean);
}

function getUserRoles(user: ApiUserLike | null | undefined): string[] {
  if (!user) return [];

  const roles = new Set<string>();
  if (typeof user.role === 'string' && user.role.trim()) {
    roles.add(user.role.trim());
  }

  for (const role of normalizeList(user.roles)) {
    roles.add(role);
  }

  return Array.from(roles);
}

function getUserScopes(user: ApiUserLike | null | undefined): string[] {
  if (!user) return [];

  const scopes = new Set<string>();
  for (const scope of normalizeList(user.scopes)) {
    scopes.add(scope);
  }

  if (typeof user.scope === 'string') {
    for (const scope of user.scope.split(/\s+/).map(item => item.trim()).filter(Boolean)) {
      scopes.add(scope);
    }
  } else {
    for (const scope of normalizeList(user.scope)) {
      scopes.add(scope);
    }
  }

  return Array.from(scopes);
}

function hasAnyScope(scopes: string[], expected: string[]): boolean {
  if (expected.length === 0) return true;
  return expected.some(scope => scopes.includes(scope));
}

function hasAnyRole(roles: string[], expected: string[]): boolean {
  if (expected.length === 0) return true;
  return expected.some(role => roles.includes(role));
}

function shouldHideField(rule: string | ProtectedFieldRule, user: ApiUserLike | null | undefined): string | null {
  if (typeof rule === 'string') {
    return rule.trim() || null;
  }

  const path = String(rule.path || rule.field || '').trim();
  if (!path) return null;

  const roles = getUserRoles(user);
  const scopes = getUserScopes(user);

  const whenRoles = normalizeList(rule.whenRole);
  const unlessRoles = normalizeList(rule.unlessRole);
  const whenScopes = normalizeList(rule.whenScope);
  const unlessScopes = normalizeList(rule.unlessScope);

  if (whenRoles.length > 0 && !hasAnyRole(roles, whenRoles)) {
    return null;
  }

  if (unlessRoles.length > 0 && hasAnyRole(roles, unlessRoles)) {
    return null;
  }

  if (whenScopes.length > 0 && !hasAnyScope(scopes, whenScopes)) {
    return null;
  }

  if (unlessScopes.length > 0 && hasAnyScope(scopes, unlessScopes)) {
    return null;
  }

  return path;
}

function matchesAccessRule(rule: AccessConditionRule | null | undefined, user: ApiUserLike | null | undefined): boolean {
  if (!rule) {
    return true;
  }

  const roles = getUserRoles(user);
  const scopes = getUserScopes(user);

  const whenRoles = normalizeList(rule.whenRole);
  const unlessRoles = normalizeList(rule.unlessRole);
  const whenScopes = normalizeList(rule.whenScope);
  const unlessScopes = normalizeList(rule.unlessScope);

  if (whenRoles.length > 0 && !hasAnyRole(roles, whenRoles)) {
    return false;
  }

  if (unlessRoles.length > 0 && hasAnyRole(roles, unlessRoles)) {
    return false;
  }

  if (whenScopes.length > 0 && !hasAnyScope(scopes, whenScopes)) {
    return false;
  }

  if (unlessScopes.length > 0 && hasAnyScope(scopes, unlessScopes)) {
    return false;
  }

  if (rule.guard) {
    return checkGuard({ user: user || null }, rule.guard, null);
  }

  return true;
}

function sortByPriority<T extends { priority?: number }>(left: T, right: T): number {
  return (right.priority ?? 0) - (left.priority ?? 0);
}

function selectWritePolicy(
  config: WritePolicyConfig | undefined,
  user: ApiUserLike | null | undefined
): WriteOperationPolicy {
  if (!config) {
    return {};
  }

  if (Array.isArray(config)) {
    const matchingPolicies = config
      .filter((entry): entry is WriteOperationPolicy => !!entry && typeof entry === 'object')
      .filter((entry) => matchesAccessRule(entry, user))
      .sort(sortByPriority);

    return matchingPolicies[0] || {};
  }

  if (!matchesAccessRule(config, user)) {
    return {};
  }

  return config;
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item)) as unknown as T;
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      result[key] = cloneValue(entryValue);
    }
    return result as T;
  }

  return value;
}

function deleteNestedField(obj: Record<string, unknown>, path: string): void {
  const parts = path.split('.').map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return;

  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const nextValue = current[part];
    if (!nextValue || typeof nextValue !== 'object' || Array.isArray(nextValue)) {
      return;
    }
    current = nextValue as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;
  delete current[lastPart];
}

function readPathValue(source: unknown, path: string): unknown {
  const parts = path.split('.').map(part => part.trim()).filter(Boolean);
  let current = source;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function setPathValue(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.').map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return;

  let current = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const nextValue = current[part];
    if (!nextValue || typeof nextValue !== 'object' || Array.isArray(nextValue)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]!] = cloneValue(value);
}

function projectFields<T>(data: T, fields: string[] | undefined): T {
  if (!fields || fields.length === 0) {
    return cloneValue(data);
  }

  if (Array.isArray(data)) {
    return data.map(item => projectFields(item, fields)) as unknown as T;
  }

  if (!data || typeof data !== 'object') {
    return data;
  }

  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = readPathValue(data, field);
    if (value !== undefined) {
      setPathValue(result, field, value);
    }
  }

  return result as T;
}

function omitFields<T>(data: T, fields: string[] | undefined): T {
  if (!fields || fields.length === 0) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => omitFields(item, fields)) as unknown as T;
  }

  if (!data || typeof data !== 'object') {
    return data;
  }

  const result = cloneValue(data) as Record<string, unknown>;
  for (const field of fields) {
    deleteNestedField(result, field);
  }
  return result as T;
}

function pathMatchesRule(path: string, rule: string): boolean {
  return path === rule || path.startsWith(`${rule}.`);
}

function collectLeafPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return prefix ? [prefix] : [];
    }

    return value.flatMap((item, index) => {
      const nextPrefix = prefix ? `${prefix}.${index}` : String(index);
      return collectLeafPaths(item, nextPrefix);
    });
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return prefix ? [prefix] : [];
    }

    return entries.flatMap(([key, entryValue]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      return collectLeafPaths(entryValue, nextPrefix);
    });
  }

  return prefix ? [prefix] : [];
}

export function resolveProtectedFields(
  config: ProtectedFieldsConfig,
  user: ApiUserLike | null | undefined
): string[] {
  if (!Array.isArray(config) || config.length === 0) {
    return [];
  }

  const resolved = new Set<string>();
  for (const rule of config) {
    const path = shouldHideField(rule, user);
    if (path) {
      resolved.add(path);
    }
  }

  return Array.from(resolved);
}

export function resolveRequestedView(
  apiConfig: ApiPolicyConfig,
  viewName: string | null | undefined,
  user: ApiUserLike | null | undefined
): ViewResolutionSuccess | ViewResolutionError {
  const normalizedViewName = typeof viewName === 'string' && viewName.trim()
    ? viewName.trim()
    : null;

  if (!normalizedViewName) {
    const automaticView = Object.entries(apiConfig.views || {})
      .filter(([, definition]) => !!definition && (definition.auto === true || definition.default === true))
      .filter(([, definition]) => matchesAccessRule(definition, user))
      .sort(([, left], [, right]) => sortByPriority(left, right))[0];

    if (!automaticView) {
      return { ok: true, definition: null, name: null };
    }

    return {
      ok: true,
      definition: automaticView[1],
      name: automaticView[0]
    };
  }

  const views = apiConfig.views || {};
  const viewDefinition = views[normalizedViewName];

  if (!viewDefinition) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_VIEW',
      message: `Unknown view "${normalizedViewName}"`,
      details: {
        view: normalizedViewName,
        availableViews: Object.keys(views)
      }
    };
  }

  if (!matchesAccessRule(viewDefinition, user)) {
    return {
      ok: false,
      status: 403,
      code: 'VIEW_FORBIDDEN',
      message: `View "${normalizedViewName}" is not allowed for the current identity`,
      details: { view: normalizedViewName }
    };
  }

  return {
    ok: true,
    definition: viewDefinition,
    name: normalizedViewName
  };
}

export function applyResponsePolicy<T>(
  data: T,
  apiConfig: ApiPolicyConfig,
  user: ApiUserLike | null | undefined,
  viewDefinition: ViewDefinition | null = null
): T {
  const projected = viewDefinition?.fields && viewDefinition.fields.length > 0
    ? projectFields(data, viewDefinition.fields)
    : cloneValue(data);

  const omitted = viewDefinition?.omit && viewDefinition.omit.length > 0
    ? omitFields(projected, viewDefinition.omit)
    : projected;

  const protectedFields = [
    ...resolveProtectedFields(apiConfig.protected, user),
    ...resolveProtectedFields(viewDefinition?.protected, user),
  ];

  return omitFields(omitted, protectedFields);
}

export function resolveWritePolicy(
  apiConfig: ApiPolicyConfig,
  operation: 'create' | 'update' | 'patch',
  payload: Record<string, unknown>,
  user: ApiUserLike | null | undefined = null
): WritePolicyResult {
  const operationConfig = selectWritePolicy(apiConfig.write?.[operation], user);
  const readonlyPaths = Array.from(new Set([
    ...normalizeList(apiConfig.readonly),
    ...normalizeList(apiConfig.readOnly),
    ...normalizeList(operationConfig.readonly),
    ...normalizeList(operationConfig.readOnly),
    ...normalizeList(operationConfig.deny),
  ]));

  const writablePaths = (() => {
    const operationWritable = normalizeList(operationConfig.writable).concat(normalizeList(operationConfig.allow));
    if (operationWritable.length > 0) {
      return Array.from(new Set(operationWritable));
    }

    const globalWritable = normalizeList(apiConfig.writable);
    return globalWritable.length > 0 ? Array.from(new Set(globalWritable)) : null;
  })();

  const leafPaths = collectLeafPaths(payload);
  const rejected = new Set<string>();

  for (const path of leafPaths) {
    if (readonlyPaths.some(rule => pathMatchesRule(path, rule))) {
      rejected.add(path);
      continue;
    }

    if (writablePaths && !writablePaths.some(rule => pathMatchesRule(path, rule))) {
      rejected.add(path);
    }
  }

  return {
    ok: rejected.size === 0,
    rejectedPaths: Array.from(rejected).sort(),
    readonlyPaths,
    writablePaths,
  };
}
