import { asyncHandler } from '../utils/error-handler.js';
import { createLogger } from '../../../concerns/logger.js';
import * as formatter from '../utils/response-formatter.js';
import { filterProtectedFields } from '../utils/response-formatter.js';
import { guardMiddleware } from '../utils/guards.js';
import { generateRecordETag, validateIfMatch, validateIfNoneMatch } from '../utils/etag.js';
const logger = createLogger({ name: 'ResourceRoutes', level: 'info' });
function parsePopulateValues(raw) {
    if (raw === undefined || raw === null)
        return [];
    const values = Array.isArray(raw) ? raw : [raw];
    return values
        .flatMap(value => String(value).split(','))
        .map(value => value.trim())
        .filter(Boolean);
}
function addPopulatePath(tree, parts) {
    if (!parts.length)
        return;
    const [head, ...rest] = parts;
    if (!head)
        return;
    const existing = tree[head];
    if (rest.length === 0) {
        if (existing && typeof existing === 'object') {
            return;
        }
        tree[head] = true;
        return;
    }
    let node;
    if (!existing || existing === true) {
        node = { include: {} };
        tree[head] = node;
    }
    else {
        node = existing;
        if (!node.include || typeof node.include !== 'object') {
            node.include = {};
        }
    }
    addPopulatePath(node.include, rest);
}
function resolvePopulate(resource, relationsPlugin, paths) {
    if (!relationsPlugin) {
        return {
            errors: ['RelationPlugin must be installed to use populate parameter']
        };
    }
    const includesTree = {};
    const errors = [];
    for (const rawPath of paths) {
        const segments = rawPath.split('.').map(segment => segment.trim()).filter(Boolean);
        if (segments.length === 0)
            continue;
        let currentResource = resource;
        let isValid = true;
        for (let index = 0; index < segments.length; index++) {
            const segment = segments[index];
            if (!segment)
                continue;
            const resourceName = currentResource?.name || '';
            const relationDefs = currentResource?._relations ||
                relationsPlugin.relations?.[resourceName] ||
                null;
            if (!relationDefs || !relationDefs[segment]) {
                errors.push(`Relation "${segment}" is not defined on resource "${resourceName || 'unknown'}" (path "${rawPath}")`);
                isValid = false;
                break;
            }
            const relationConfig = relationDefs[segment];
            if (index < segments.length - 1) {
                const relatedResource = relationsPlugin.database?.resources?.[relationConfig.resource];
                if (!relatedResource) {
                    errors.push(`Related resource "${relationConfig.resource}" for relation "${segment}" not found (path "${rawPath}")`);
                    isValid = false;
                    break;
                }
                currentResource = relatedResource;
            }
        }
        if (isValid) {
            addPopulatePath(includesTree, segments);
        }
    }
    if (errors.length > 0) {
        return { errors };
    }
    return {
        includes: Object.keys(includesTree).length > 0 ? includesTree : null
    };
}
function parseCustomRoute(routeDef) {
    let def = routeDef.trim();
    const isAsync = def.startsWith('async ');
    if (isAsync) {
        def = def.substring(6).trim();
    }
    const parts = def.split(/\s+/);
    if (parts.length < 2 || !parts[0]) {
        throw new Error(`Invalid route definition: "${routeDef}". Expected format: "METHOD /path" or "async METHOD /path"`);
    }
    const method = parts[0].toUpperCase();
    const path = parts.slice(1).join(' ').trim();
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    if (!validMethods.includes(method)) {
        throw new Error(`Invalid HTTP method: "${method}". Must be one of: ${validMethods.join(', ')}`);
    }
    if (!path.startsWith('/')) {
        throw new Error(`Invalid route path: "${path}". Path must start with "/"`);
    }
    return { method, path, isAsync };
}
export function createResourceRoutes(resource, version, config = {}, Hono) {
    const app = new Hono();
    if (!app.describe) {
        app.describe = function (meta) {
            return this;
        };
    }
    const { methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'], customMiddleware = [], versionPrefix = '', events = null, relationsPlugin = null } = config;
    const resourceName = resource.name;
    const basePath = versionPrefix ? `/${versionPrefix}/${resourceName}` : `/${resourceName}`;
    const apiConfig = resource.$schema?.api || {};
    const guards = apiConfig.guard || null;
    const globalGuards = config.globalGuards || null;
    const protectedFields = apiConfig.protected || [];
    customMiddleware.forEach(middleware => {
        app.use('*', middleware);
    });
    const RESERVED_API_KEYS = ['guard', 'protected', 'description'];
    if (resource.config?.api && typeof resource.config.api === 'object') {
        for (const [routeDef, handler] of Object.entries(resource.config.api)) {
            if (RESERVED_API_KEYS.includes(routeDef)) {
                continue;
            }
            if (typeof handler !== 'function') {
                continue;
            }
            try {
                const { method, path } = parseCustomRoute(routeDef);
                app.on(method, path, asyncHandler(async (c) => {
                    const result = await handler(c, { resource, database: resource.database });
                    if (result && result.constructor && result.constructor.name === 'Response') {
                        return result;
                    }
                    if (result !== undefined && result !== null) {
                        return c.json(formatter.success(result));
                    }
                    return c.json(formatter.noContent(), 204);
                }));
                if (config.logLevel || resource.database?.logger?.level === 'debug') {
                    logger.info(`[API Plugin] Registered custom route for ${resourceName}: ${method} ${path}`);
                }
            }
            catch (error) {
                logger.error({ err: error }, `[API Plugin] Error registering custom route "${routeDef}" for ${resourceName}`);
                throw error;
            }
        }
    }
    if (methods.includes('GET')) {
        const listHandler = asyncHandler(async (c) => {
            const query = c.req.query();
            const limit = parseInt(query.limit || '100') || 100;
            const offset = parseInt(query.offset || '0') || 0;
            const partition = query.partition;
            const partitionValues = query.partitionValues
                ? JSON.parse(query.partitionValues)
                : undefined;
            const populateValues = parsePopulateValues(query.populate);
            let populateIncludes = null;
            if (populateValues.length > 0) {
                const populateResult = resolvePopulate(resource, relationsPlugin, populateValues);
                if (populateResult.errors) {
                    const response = formatter.error('Invalid populate parameter', {
                        status: 400,
                        code: 'INVALID_POPULATE',
                        details: { errors: populateResult.errors.map(e => ({ field: 'populate', message: e })) }
                    });
                    return c.json(response, response._status);
                }
                populateIncludes = populateResult.includes || null;
            }
            const reservedKeys = ['limit', 'offset', 'partition', 'partitionValues', 'sort', 'populate'];
            const filters = {};
            for (const [key, value] of Object.entries(query)) {
                if (!reservedKeys.includes(key)) {
                    try {
                        filters[key] = JSON.parse(value);
                    }
                    catch {
                        filters[key] = value;
                    }
                }
            }
            const guardPartitionFilters = c.get('partitionFilters') || [];
            let items;
            let total;
            if (guardPartitionFilters.length > 0 && guardPartitionFilters[0]) {
                const { partitionName, partitionFields } = guardPartitionFilters[0];
                items = await resource.listPartition({ partition: partitionName, partitionValues: partitionFields, limit, offset });
                total = items.length;
            }
            else if (Object.keys(filters).length > 0) {
                items = await resource.query(filters, { limit, offset });
                total = items.length;
            }
            else if (partition && partitionValues) {
                items = await resource.listPartition({
                    partition,
                    partitionValues,
                    limit,
                    offset
                });
                total = items.length;
            }
            else {
                items = await resource.list({ limit, offset });
                total = items.length;
            }
            if (populateIncludes && relationsPlugin && items && items.length > 0) {
                await relationsPlugin.populate(resource, items, populateIncludes);
            }
            const filteredItems = filterProtectedFields(items, protectedFields);
            const response = formatter.list(filteredItems, {
                total,
                page: Math.floor(offset / limit) + 1,
                pageSize: limit,
                pageCount: Math.ceil(total / limit)
            });
            c.header('X-Total-Count', total.toString());
            c.header('X-Page-Count', Math.ceil(total / limit).toString());
            return c.json(response, response._status);
        });
        app.describe({
            description: `List ${resourceName} records with pagination and filtering`,
            tags: [resourceName],
            operationId: `list_${resourceName}`,
            responseSchema: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' },
                    data: { type: 'array', items: { type: 'object' } },
                    pagination: {
                        type: 'object',
                        properties: {
                            total: { type: 'integer' },
                            limit: { type: 'integer' },
                            offset: { type: 'integer' },
                            page: { type: 'integer' },
                            pageSize: { type: 'integer' },
                            pageCount: { type: 'integer' }
                        }
                    }
                }
            }
        }).get('/', guardMiddleware(guards, 'list', { globalGuards }), listHandler);
    }
    if (methods.includes('GET')) {
        const getHandler = asyncHandler(async (c) => {
            const id = c.req.param('id');
            const query = c.req.query();
            const partition = query.partition;
            const partitionValues = query.partitionValues
                ? JSON.parse(query.partitionValues)
                : undefined;
            const populateValues = parsePopulateValues(query.populate);
            let populateIncludes = null;
            if (populateValues.length > 0) {
                const populateResult = resolvePopulate(resource, relationsPlugin, populateValues);
                if (populateResult.errors) {
                    const response = formatter.error('Invalid populate parameter', {
                        status: 400,
                        code: 'INVALID_POPULATE',
                        details: { errors: populateResult.errors.map(e => ({ field: 'populate', message: e })) }
                    });
                    return c.json(response, response._status);
                }
                populateIncludes = populateResult.includes || null;
            }
            let item;
            if (partition && partitionValues) {
                item = await resource.getFromPartition({
                    id,
                    partitionName: partition,
                    partitionValues
                });
            }
            else {
                item = await resource.get(id);
            }
            if (!item) {
                const response = formatter.notFound(resourceName, id);
                return c.json(response, response._status);
            }
            if (populateIncludes && relationsPlugin) {
                await relationsPlugin.populate(resource, item, populateIncludes);
            }
            const etag = generateRecordETag(item);
            if (etag) {
                c.header('ETag', etag);
            }
            const ifNoneMatch = c.req.header('If-None-Match');
            if (ifNoneMatch && !validateIfNoneMatch(ifNoneMatch, etag)) {
                return c.body(null, 304);
            }
            const filteredItem = filterProtectedFields(item, protectedFields);
            const response = formatter.success(filteredItem);
            return c.json(response, response._status);
        });
        app.describe({
            description: `Get single ${resourceName} record by ID with optional relation population`,
            tags: [resourceName],
            operationId: `get_${resourceName}`,
            responseSchema: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' },
                    data: { type: 'object' }
                }
            }
        }).get('/:id', guardMiddleware(guards, 'get', { globalGuards }), getHandler);
    }
    if (methods.includes('POST')) {
        const createHandler = asyncHandler(async (c) => {
            const data = await c.req.json();
            const item = await resource.insert(data, {
                user: c.get('user'),
                request: c.req
            });
            if (events) {
                events.emitResourceEvent('created', {
                    resource: resourceName,
                    id: item.id,
                    data: item,
                    user: c.get('user')
                });
            }
            const location = `${basePath}/${item.id}`;
            const prefer = c.req.header('Prefer');
            const preferMinimal = prefer && prefer.includes('return=minimal');
            c.header('Location', location);
            if (preferMinimal) {
                c.header('Preference-Applied', 'return=minimal');
                return c.body(null, 201);
            }
            const filteredItem = filterProtectedFields(item, protectedFields);
            const response = formatter.created(filteredItem, location);
            return c.json(response, response._status);
        });
        app.describe({
            description: `Create new ${resourceName} record`,
            tags: [resourceName],
            operationId: `create_${resourceName}`,
            responseSchema: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' },
                    data: { type: 'object' }
                }
            }
        }).post('/', guardMiddleware(guards, 'create', { globalGuards }), createHandler);
    }
    if (methods.includes('PUT')) {
        const updateHandler = asyncHandler(async (c) => {
            const id = c.req.param('id');
            const data = await c.req.json();
            const existing = await resource.get(id);
            if (!existing) {
                const response = formatter.notFound(resourceName, id);
                return c.json(response, response._status);
            }
            const ifMatch = c.req.header('If-Match');
            if (ifMatch) {
                const currentETag = generateRecordETag(existing);
                if (!validateIfMatch(ifMatch, currentETag)) {
                    const response = formatter.error('Resource was modified by another request. Please refetch and retry.', {
                        status: 412,
                        code: 'ETAG_MISMATCH'
                    });
                    return c.json(response, 412);
                }
            }
            const updated = await resource.update(id, data, {
                user: c.get('user'),
                request: c.req
            });
            const newETag = generateRecordETag(updated);
            if (newETag) {
                c.header('ETag', newETag);
            }
            if (events) {
                events.emitResourceEvent('updated', {
                    resource: resourceName,
                    id: updated.id,
                    data: updated,
                    previous: existing,
                    user: c.get('user')
                });
            }
            const prefer = c.req.header('Prefer');
            const preferMinimal = prefer && prefer.includes('return=minimal');
            if (preferMinimal) {
                c.header('Preference-Applied', 'return=minimal');
                return c.body(null, 200);
            }
            const filteredUpdated = filterProtectedFields(updated, protectedFields);
            const response = formatter.success(filteredUpdated);
            return c.json(response, response._status);
        });
        app.describe({
            description: `Update ${resourceName} record (full replacement with merge)`,
            tags: [resourceName],
            operationId: `update_${resourceName}`,
            responseSchema: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' },
                    data: { type: 'object' }
                }
            }
        }).put('/:id', guardMiddleware(guards, 'update', { globalGuards }), updateHandler);
    }
    if (methods.includes('PATCH')) {
        const patchHandler = asyncHandler(async (c) => {
            const id = c.req.param('id');
            const data = await c.req.json();
            const existing = await resource.get(id);
            if (!existing) {
                const response = formatter.notFound(resourceName, id);
                return c.json(response, response._status);
            }
            const ifMatch = c.req.header('If-Match');
            if (ifMatch) {
                const currentETag = generateRecordETag(existing);
                if (!validateIfMatch(ifMatch, currentETag)) {
                    const response = formatter.error('Resource was modified by another request. Please refetch and retry.', {
                        status: 412,
                        code: 'ETAG_MISMATCH'
                    });
                    return c.json(response, 412);
                }
            }
            const merged = { ...existing, ...data, id };
            const updated = await resource.update(id, merged, {
                user: c.get('user'),
                request: c.req
            });
            const newETag = generateRecordETag(updated);
            if (newETag) {
                c.header('ETag', newETag);
            }
            if (events) {
                events.emitResourceEvent('updated', {
                    resource: resourceName,
                    id: updated.id,
                    data: updated,
                    previous: existing,
                    partial: true,
                    user: c.get('user')
                });
            }
            const prefer = c.req.header('Prefer');
            const preferMinimal = prefer && prefer.includes('return=minimal');
            if (preferMinimal) {
                c.header('Preference-Applied', 'return=minimal');
                return c.body(null, 200);
            }
            const filteredUpdated = filterProtectedFields(updated, protectedFields);
            const response = formatter.success(filteredUpdated);
            return c.json(response, response._status);
        });
        app.describe({
            description: `Partially update ${resourceName} record (merge with existing)`,
            tags: [resourceName],
            operationId: `patch_${resourceName}`,
            responseSchema: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' },
                    data: { type: 'object' }
                }
            }
        }).patch('/:id', guardMiddleware(guards, 'update', { globalGuards }), patchHandler);
    }
    if (methods.includes('DELETE')) {
        const deleteHandler = asyncHandler(async (c) => {
            const id = c.req.param('id');
            const existing = await resource.get(id);
            if (!existing) {
                const response = formatter.notFound(resourceName, id);
                return c.json(response, response._status);
            }
            const ifMatch = c.req.header('If-Match');
            if (ifMatch) {
                const currentETag = generateRecordETag(existing);
                if (!validateIfMatch(ifMatch, currentETag)) {
                    const response = formatter.error('Resource was modified by another request. Please refetch and retry.', {
                        status: 412,
                        code: 'ETAG_MISMATCH'
                    });
                    return c.json(response, 412);
                }
            }
            await resource.delete(id);
            if (events) {
                events.emitResourceEvent('deleted', {
                    resource: resourceName,
                    id,
                    previous: existing,
                    user: c.get('user')
                });
            }
            return c.body(null, 204);
        });
        app.describe({
            description: `Delete ${resourceName} record by ID`,
            tags: [resourceName],
            operationId: `delete_${resourceName}`,
            responseSchema: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' }
                }
            }
        }).delete('/:id', guardMiddleware(guards, 'delete', { globalGuards }), deleteHandler);
    }
    if (methods.includes('HEAD')) {
        const headListHandler = asyncHandler(async (c) => {
            const total = await resource.count();
            const resourceVersion = resource.config?.currentVersion || resource.version || 'v1';
            c.header('X-Total-Count', total.toString());
            c.header('X-Resource-Version', resourceVersion);
            c.header('X-Schema-Fields', Object.keys(resource.config?.attributes || {}).length.toString());
            return c.body(null, 200);
        });
        const headItemHandler = asyncHandler(async (c) => {
            const id = c.req.param('id');
            const item = await resource.get(id);
            if (!item) {
                return c.body(null, 404);
            }
            const etag = generateRecordETag(item);
            if (etag) {
                c.header('ETag', etag);
            }
            if (item._updatedAt) {
                c.header('Last-Modified', new Date(item._updatedAt).toUTCString());
            }
            else if (item._createdAt) {
                c.header('Last-Modified', new Date(item._createdAt).toUTCString());
            }
            const ifNoneMatch = c.req.header('If-None-Match');
            if (ifNoneMatch && !validateIfNoneMatch(ifNoneMatch, etag)) {
                return c.body(null, 304);
            }
            return c.body(null, 200);
        });
        // Use on() for HEAD - fallback gracefully if on() not available (bundling issues)
        if (typeof app.on === 'function') {
            app.on('HEAD', '/', headListHandler);
            app.on('HEAD', '/:id', headItemHandler);
        }
    }
    if (methods.includes('OPTIONS')) {
        app.options('/', asyncHandler(async (c) => {
            c.header('Allow', methods.join(', '));
            c.header('Accept-Patch', 'application/json');
            if (methods.includes('GET') || methods.includes('HEAD')) {
                c.header('ETag-Support', 'weak, If-None-Match');
            }
            if (methods.includes('PUT') || methods.includes('PATCH') || methods.includes('DELETE')) {
                c.header('Concurrency-Control', 'If-Match');
            }
            const total = await resource.count();
            const schema = resource.config?.attributes || {};
            const resourceVersion = resource.config?.currentVersion || resource.version || 'v1';
            const metadata = {
                resource: resourceName,
                version: resourceVersion,
                totalRecords: total,
                allowedMethods: methods,
                features: {
                    etag: true,
                    conditionalRequests: true,
                    partitioning: Object.keys(resource.config?.partitions || {}).length > 0,
                    filtering: true,
                    pagination: true,
                    sorting: false
                },
                conditionalHeaders: {
                    'If-Match': 'Prevent conflicts (PUT/PATCH/DELETE) - returns 412 on mismatch',
                    'If-None-Match': 'Cache validation (GET/HEAD) - returns 304 if not modified'
                },
                preferenceHeaders: {
                    'Prefer: return=minimal': 'Request minimal response (POST/PUT/PATCH) - returns status only, no body'
                },
                schema: Object.entries(schema).map(([name, def]) => ({
                    name,
                    type: typeof def === 'string' ? def.split('|')[0] : def.type,
                    rules: typeof def === 'string' ? def.split('|').slice(1) : []
                })),
                endpoints: {
                    list: `/${resourceVersion}/${resourceName}`,
                    get: `/${resourceVersion}/${resourceName}/:id`,
                    create: `/${resourceVersion}/${resourceName}`,
                    update: `/${resourceVersion}/${resourceName}/:id`,
                    delete: `/${resourceVersion}/${resourceName}/:id`
                },
                queryParameters: {
                    limit: 'number (1-1000, default: 100)',
                    offset: 'number (min: 0, default: 0)',
                    partition: 'string (partition name)',
                    partitionValues: 'JSON string',
                    '[any field]': 'any (filter by field value)'
                },
                statusCodes: {
                    200: 'OK - Successful GET/PUT/PATCH',
                    201: 'Created - Successful POST',
                    204: 'No Content - Successful DELETE',
                    304: 'Not Modified - Resource unchanged (If-None-Match)',
                    404: 'Not Found - Resource does not exist',
                    412: 'Precondition Failed - ETag mismatch (If-Match)',
                    422: 'Unprocessable Entity - Validation error'
                }
            };
            return c.json(metadata);
        }));
        app.options('/:id', (c) => {
            const itemMethods = methods.filter(m => m !== 'POST');
            c.header('Allow', itemMethods.join(', '));
            c.header('Accept-Patch', 'application/json');
            if (itemMethods.includes('GET') || itemMethods.includes('HEAD')) {
                c.header('ETag-Support', 'weak, If-None-Match');
            }
            if (itemMethods.includes('PUT') || itemMethods.includes('PATCH') || itemMethods.includes('DELETE')) {
                c.header('Concurrency-Control', 'If-Match');
            }
            return c.body(null, 204);
        });
    }
    return app;
}
export function createRelationalRoutes(sourceResource, relationName, relationConfig, version, Hono) {
    const app = new Hono();
    const resourceName = sourceResource.name;
    const relatedResourceName = relationConfig.resource;
    app.get('/', asyncHandler(async (c) => {
        const pathParts = c.req.path.split('/');
        const relationNameIndex = pathParts.lastIndexOf(relationName);
        const id = pathParts[relationNameIndex - 1] || '';
        const query = c.req.query();
        const source = await sourceResource.get(id);
        if (!source) {
            const response = formatter.notFound(resourceName, id);
            return c.json(response, response._status);
        }
        const result = await sourceResource.get(id, {
            include: [relationName]
        });
        const relatedData = result?.[relationName];
        if (!relatedData) {
            if (relationConfig.type === 'hasMany' || relationConfig.type === 'belongsToMany') {
                const response = formatter.list([], {
                    total: 0,
                    page: 1,
                    pageSize: 100,
                    pageCount: 0
                });
                return c.json(response, response._status);
            }
            else {
                const response = formatter.notFound(relatedResourceName, 'related resource');
                return c.json(response, response._status);
            }
        }
        if (relationConfig.type === 'hasMany' || relationConfig.type === 'belongsToMany') {
            const items = Array.isArray(relatedData) ? relatedData : [relatedData];
            const limit = parseInt(query.limit || '100') || 100;
            const offset = parseInt(query.offset || '0') || 0;
            const paginatedItems = items.slice(offset, offset + limit);
            const response = formatter.list(paginatedItems, {
                total: items.length,
                page: Math.floor(offset / limit) + 1,
                pageSize: limit,
                pageCount: Math.ceil(items.length / limit)
            });
            c.header('X-Total-Count', items.length.toString());
            c.header('X-Page-Count', Math.ceil(items.length / limit).toString());
            return c.json(response, response._status);
        }
        else {
            const response = formatter.success(relatedData);
            return c.json(response, response._status);
        }
    }));
    return app;
}
export default {
    createResourceRoutes,
    createRelationalRoutes
};
//# sourceMappingURL=resource-routes.js.map