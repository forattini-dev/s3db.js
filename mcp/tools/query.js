export const queryTools = [
    {
        name: 'resourceQuery',
        description: 'Query documents with complex filters and conditions',
        inputSchema: {
            type: 'object',
            properties: {
                resourceName: {
                    type: 'string',
                    description: 'Name of the resource'
                },
                filters: {
                    type: 'object',
                    description: 'Query filters (e.g., {status: "active", age: {$gt: 18}})'
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results',
                    default: 100
                },
                offset: {
                    type: 'number',
                    description: 'Number of results to skip',
                    default: 0
                }
            },
            required: ['resourceName', 'filters']
        }
    },
    {
        name: 'resourceSearch',
        description: 'Search for documents by text in specific fields',
        inputSchema: {
            type: 'object',
            properties: {
                resourceName: {
                    type: 'string',
                    description: 'Name of the resource'
                },
                searchText: {
                    type: 'string',
                    description: 'Text to search for'
                },
                fields: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Fields to search in (if not specified, searches all string fields)'
                },
                caseSensitive: {
                    type: 'boolean',
                    description: 'Case-sensitive search',
                    default: false
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results',
                    default: 100
                }
            },
            required: ['resourceName', 'searchText']
        }
    }
];
export function createQueryHandlers(server) {
    return {
        async resourceQuery(args, database) {
            server.ensureConnected(database);
            const { resourceName, filters, limit = 100, offset = 0 } = args;
            const resource = server.getResource(database, resourceName);
            try {
                // Use the query method from resource
                const results = await resource.query(filters, { limit, offset });
                return {
                    success: true,
                    data: results,
                    count: results.length,
                    filters,
                    pagination: {
                        limit,
                        offset,
                        hasMore: results.length === limit
                    }
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error.message,
                    filters
                };
            }
        },
        async resourceSearch(args, database) {
            server.ensureConnected(database);
            const { resourceName, searchText, fields, caseSensitive = false, limit = 100 } = args;
            const resource = server.getResource(database, resourceName);
            try {
                // Get all documents and filter in memory
                const allDocs = await resource.list({ limit: (limit || 100) * 2 }); // Fetch more to ensure we have enough after filtering
                const searchString = caseSensitive ? searchText : searchText.toLowerCase();
                // Determine fields to search
                let searchFields = fields;
                if (!searchFields || searchFields.length === 0) {
                    // Auto-detect string fields
                    searchFields = Object.keys(resource.attributes || {}).filter(key => {
                        const attr = resource.attributes[key];
                        const type = typeof attr === 'string' ? attr.split('|')[0] : attr.type;
                        return type === 'string';
                    });
                }
                // Filter documents
                const results = allDocs.filter((doc) => {
                    return searchFields.some(field => {
                        const value = doc[field];
                        if (!value)
                            return false;
                        const valueString = caseSensitive ? String(value) : String(value).toLowerCase();
                        return valueString.includes(searchString);
                    });
                }).slice(0, limit);
                return {
                    success: true,
                    data: results,
                    count: results.length,
                    searchText,
                    searchFields,
                    caseSensitive
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error.message,
                    searchText
                };
            }
        }
    };
}
//# sourceMappingURL=query.js.map