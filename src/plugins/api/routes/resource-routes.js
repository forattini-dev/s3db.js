/**
 * Resource Routes - Dynamic RESTful routes for s3db.js resources
 *
 * Automatically generates REST endpoints for each resource
 */

import { asyncHandler } from '../utils/error-handler.js';
import * as formatter from '../utils/response-formatter.js';
import { guardMiddleware } from '../utils/guards.js';

/**
 * Parse custom route definition (e.g., "GET /healthcheck" or "async POST /custom")
 * @param {string} routeDef - Route definition string
 * @returns {Object} Parsed route { method, path, isAsync }
 */
function parseCustomRoute(routeDef) {
  // Remove "async" prefix if present
  let def = routeDef.trim();
  const isAsync = def.startsWith('async ');

  if (isAsync) {
    def = def.substring(6).trim(); // Remove "async "
  }

  // Split by space (e.g., "GET /path" -> ["GET", "/path"])
  const parts = def.split(/\s+/);

  if (parts.length < 2) {
    throw new Error(`Invalid route definition: "${routeDef}". Expected format: "METHOD /path" or "async METHOD /path"`);
  }

  const method = parts[0].toUpperCase();
  const path = parts.slice(1).join(' ').trim(); // Join remaining parts in case path has spaces (unlikely but possible)

  // Validate HTTP method
  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  if (!validMethods.includes(method)) {
    throw new Error(`Invalid HTTP method: "${method}". Must be one of: ${validMethods.join(', ')}`);
  }

  // Validate path starts with /
  if (!path.startsWith('/')) {
    throw new Error(`Invalid route path: "${path}". Path must start with "/"`);
  }

  return { method, path, isAsync };
}

/**
 * Create routes for a resource
 * @param {Object} resource - s3db.js Resource instance
 * @param {string} version - Resource version (e.g., 'v1', 'v1')
 * @param {Object} config - Route configuration
 * @param {Function} Hono - Hono constructor (passed from server.js)
 * @returns {Hono} Hono app with resource routes
 */
export function createResourceRoutes(resource, version, config = {}, Hono) {
  const app = new Hono();
  const {
    methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    customMiddleware = [],
    enableValidation = true,
    versionPrefix = '', // Empty string by default (calculated in server.js)
    events = null // Event emitter for lifecycle hooks
  } = config;

  const resourceName = resource.name;
  const basePath = versionPrefix ? `/${versionPrefix}/${resourceName}` : `/${resourceName}`;

  // Get guards configuration from resource config
  const guards = resource.config?.guards || null;

  // Apply custom middleware
  customMiddleware.forEach(middleware => {
    app.use('*', middleware);
  });

  // Register custom routes from resource.config.api (if defined)
  if (resource.config?.api && typeof resource.config.api === 'object') {
    for (const [routeDef, handler] of Object.entries(resource.config.api)) {
      try {
        const { method, path } = parseCustomRoute(routeDef);

        if (typeof handler !== 'function') {
          throw new Error(`Handler for route "${routeDef}" must be a function`);
        }

        // Register the custom route
        // The handler receives the full Hono context
        app.on(method, path, asyncHandler(async (c) => {
          // Call user's handler with Hono context
          const result = await handler(c, { resource, database: resource.database });

          // If handler already returned a response, use it
          if (result && result.constructor && result.constructor.name === 'Response') {
            return result;
          }

          // If handler returned data, wrap in success formatter
          if (result !== undefined && result !== null) {
            return c.json(formatter.success(result));
          }

          // If no return value, return 204 No Content
          return c.json(formatter.noContent(), 204);
        }));

        if (config.verbose || resource.database?.verbose) {
          console.log(`[API Plugin] Registered custom route for ${resourceName}: ${method} ${path}`);
        }
      } catch (error) {
        console.error(`[API Plugin] Error registering custom route "${routeDef}" for ${resourceName}:`, error.message);
        throw error;
      }
    }
  }

  // LIST - GET /{version}/{resource}
  if (methods.includes('GET')) {
    app.get('/', guardMiddleware(guards, 'list'), asyncHandler(async (c) => {
      const query = c.req.query();
      const limit = parseInt(query.limit) || 100;
      const offset = parseInt(query.offset) || 0;
      const partition = query.partition;
      const partitionValues = query.partitionValues
        ? JSON.parse(query.partitionValues)
        : undefined;

      // Extract filters from query string (any key that's not limit, offset, partition, partitionValues, sort)
      const reservedKeys = ['limit', 'offset', 'partition', 'partitionValues', 'sort'];
      const filters = {};
      for (const [key, value] of Object.entries(query)) {
        if (!reservedKeys.includes(key)) {
          // Try to parse as JSON for complex values
          try {
            filters[key] = JSON.parse(value);
          } catch {
            // Keep as string if not valid JSON
            filters[key] = value;
          }
        }
      }

      let items;
      let total;

      // Use query if filters are present
      if (Object.keys(filters).length > 0) {
        // Query with native offset support (efficient!)
        items = await resource.query(filters, { limit, offset });
        // Note: total is approximate (length of returned items)
        // For exact total count with filters, would need separate count query
        total = items.length;
      } else if (partition && partitionValues) {
        // Query specific partition
        items = await resource.listPartition({
          partition,
          partitionValues,
          limit,
          offset
        });
        total = items.length;
      } else {
        // Regular list
        items = await resource.list({ limit, offset });
        total = items.length;
      }

      const response = formatter.list(items, {
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        pageCount: Math.ceil(total / limit)
      });

      // Set pagination headers
      c.header('X-Total-Count', total.toString());
      c.header('X-Page-Count', Math.ceil(total / limit).toString());

      return c.json(response, response._status);
    }));
  }

  // GET ONE - GET /{version}/{resource}/:id
  if (methods.includes('GET')) {
    app.get('/:id', guardMiddleware(guards, 'get'), asyncHandler(async (c) => {
      const id = c.req.param('id');
      const query = c.req.query();
      const partition = query.partition;
      const partitionValues = query.partitionValues
        ? JSON.parse(query.partitionValues)
        : undefined;

      let item;

      if (partition && partitionValues) {
        // Get from specific partition
        item = await resource.getFromPartition({
          id,
          partitionName: partition,
          partitionValues
        });
      } else {
        // Regular get
        item = await resource.get(id);
      }

      if (!item) {
        const response = formatter.notFound(resourceName, id);
        return c.json(response, response._status);
      }

      const response = formatter.success(item);
      return c.json(response, response._status);
    }));
  }

  // CREATE - POST /{version}/{resource}
  if (methods.includes('POST')) {
    app.post('/', guardMiddleware(guards, 'create'), asyncHandler(async (c) => {
      const data = await c.req.json();

      // Validation middleware will run if enabled
      const item = await resource.insert(data);

      // Emit resource:created event
      if (events) {
        events.emitResourceEvent('created', {
          resource: resourceName,
          id: item.id,
          data: item,
          user: c.get('user')
        });
      }

      const location = `${basePath}/${item.id}`;
      const response = formatter.created(item, location);

      c.header('Location', location);
      return c.json(response, response._status);
    }));
  }

  // UPDATE (full) - PUT /{version}/{resource}/:id
  if (methods.includes('PUT')) {
    app.put('/:id', guardMiddleware(guards, 'update'), asyncHandler(async (c) => {
      const id = c.req.param('id');
      const data = await c.req.json();

      // Check if exists
      const existing = await resource.get(id);
      if (!existing) {
        const response = formatter.notFound(resourceName, id);
        return c.json(response, response._status);
      }

      // Full update
      const updated = await resource.update(id, data);

      // Emit resource:updated event
      if (events) {
        events.emitResourceEvent('updated', {
          resource: resourceName,
          id: updated.id,
          data: updated,
          previous: existing,
          user: c.get('user')
        });
      }

      const response = formatter.success(updated);
      return c.json(response, response._status);
    }));
  }

  // UPDATE (partial) - PATCH /{version}/{resource}/:id
  if (methods.includes('PATCH')) {
    app.patch('/:id', guardMiddleware(guards, 'update'), asyncHandler(async (c) => {
      const id = c.req.param('id');
      const data = await c.req.json();

      // Check if exists
      const existing = await resource.get(id);
      if (!existing) {
        const response = formatter.notFound(resourceName, id);
        return c.json(response, response._status);
      }

      // Partial update (merge with existing)
      const merged = { ...existing, ...data, id };
      const updated = await resource.update(id, merged);

      // Emit resource:updated event
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

      const response = formatter.success(updated);
      return c.json(response, response._status);
    }));
  }

  // DELETE - DELETE /{version}/{resource}/:id
  if (methods.includes('DELETE')) {
    app.delete('/:id', guardMiddleware(guards, 'delete'), asyncHandler(async (c) => {
      const id = c.req.param('id');

      // Check if exists
      const existing = await resource.get(id);
      if (!existing) {
        const response = formatter.notFound(resourceName, id);
        return c.json(response, response._status);
      }

      await resource.delete(id);

      // Emit resource:deleted event
      if (events) {
        events.emitResourceEvent('deleted', {
          resource: resourceName,
          id,
          previous: existing,
          user: c.get('user')
        });
      }

      const response = formatter.noContent();
      return c.json(response, response._status);
    }));
  }

  // HEAD - HEAD /{version}/{resource}
  if (methods.includes('HEAD')) {
    app.on('HEAD', '/', asyncHandler(async (c) => {
      // Get statistics
      const total = await resource.count();
      const version = resource.config?.currentVersion || resource.version || 'v1';

      // Set resource metadata headers
      c.header('X-Total-Count', total.toString());
      c.header('X-Resource-Version', version);
      c.header('X-Schema-Fields', Object.keys(resource.config?.attributes || {}).length.toString());

      return c.body(null, 200);
    }));

    app.on('HEAD', '/:id', asyncHandler(async (c) => {
      const id = c.req.param('id');
      const item = await resource.get(id);

      if (!item) {
        return c.body(null, 404);
      }

      // Add metadata headers
      if (item.updatedAt) {
        c.header('Last-Modified', new Date(item.updatedAt).toUTCString());
      }

      return c.body(null, 200);
    }));
  }

  // OPTIONS - OPTIONS /{version}/{resource}
  if (methods.includes('OPTIONS')) {
    app.options('/', asyncHandler(async (c) => {
      c.header('Allow', methods.join(', '));

      // Return metadata about the resource
      const total = await resource.count();
      const schema = resource.config?.attributes || {};
      const version = resource.config?.currentVersion || resource.version || 'v1';

      const metadata = {
        resource: resourceName,
        version,
        totalRecords: total,
        allowedMethods: methods,
        schema: Object.entries(schema).map(([name, def]) => ({
          name,
          type: typeof def === 'string' ? def.split('|')[0] : def.type,
          rules: typeof def === 'string' ? def.split('|').slice(1) : []
        })),
        endpoints: {
          list: `/${version}/${resourceName}`,
          get: `/${version}/${resourceName}/:id`,
          create: `/${version}/${resourceName}`,
          update: `/${version}/${resourceName}/:id`,
          delete: `/${version}/${resourceName}/:id`
        },
        queryParameters: {
          limit: 'number (1-1000, default: 100)',
          offset: 'number (min: 0, default: 0)',
          partition: 'string (partition name)',
          partitionValues: 'JSON string',
          '[any field]': 'any (filter by field value)'
        }
      };

      return c.json(metadata);
    }));

    app.options('/:id', (c) => {
      c.header('Allow', methods.filter(m => m !== 'POST').join(', '));
      return c.body(null, 204);
    });
  }

  return app;
}

/**
 * Create relational routes for a resource relation
 * @param {Object} sourceResource - Source s3db.js Resource instance
 * @param {string} relationName - Name of the relation (e.g., 'posts', 'profile')
 * @param {Object} relationConfig - Relation configuration from RelationPlugin
 * @param {string} version - Resource version (e.g., 'v1')
 * @returns {Hono} Hono app with relational routes
 */
export function createRelationalRoutes(sourceResource, relationName, relationConfig, version, Hono) {
  const app = new Hono();
  const resourceName = sourceResource.name;
  const relatedResourceName = relationConfig.resource;

  // GET /{version}/{resource}/:id/{relation}
  // Examples: GET /v1/users/user123/posts, GET /v1/users/user123/profile
  // Note: The :id param comes from parent route mounting (see server.js:469)
  app.get('/', asyncHandler(async (c) => {
    // Get parent route's :id param
    const pathParts = c.req.path.split('/');
    const relationNameIndex = pathParts.lastIndexOf(relationName);
    const id = pathParts[relationNameIndex - 1];
    const query = c.req.query();

    // Check if source resource exists
    const source = await sourceResource.get(id);
    if (!source) {
      const response = formatter.notFound(resourceName, id);
      return c.json(response, response._status);
    }

    // Use RelationPlugin's include feature to load the relation
    const result = await sourceResource.get(id, {
      include: [relationName]
    });

    const relatedData = result[relationName];

    // Check if relation exists
    if (!relatedData) {
      // Return appropriate response based on relation type
      if (relationConfig.type === 'hasMany' || relationConfig.type === 'belongsToMany') {
        // For *-to-many relations, return empty array
        const response = formatter.list([], {
          total: 0,
          page: 1,
          pageSize: 100,
          pageCount: 0
        });
        return c.json(response, response._status);
      } else {
        // For *-to-one relations, return 404
        const response = formatter.notFound(relatedResourceName, 'related resource');
        return c.json(response, response._status);
      }
    }

    // Return appropriate format based on relation type
    if (relationConfig.type === 'hasMany' || relationConfig.type === 'belongsToMany') {
      // For *-to-many, return list format
      const items = Array.isArray(relatedData) ? relatedData : [relatedData];
      const limit = parseInt(query.limit) || 100;
      const offset = parseInt(query.offset) || 0;

      // Apply pagination
      const paginatedItems = items.slice(offset, offset + limit);

      const response = formatter.list(paginatedItems, {
        total: items.length,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        pageCount: Math.ceil(items.length / limit)
      });

      // Set pagination headers
      c.header('X-Total-Count', items.length.toString());
      c.header('X-Page-Count', Math.ceil(items.length / limit).toString());

      return c.json(response, response._status);
    } else {
      // For *-to-one, return single resource format
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
