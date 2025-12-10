export const exportImportTools = [
    {
        name: 'resourceExport',
        description: 'Export resource data to JSON, CSV, or NDJSON format',
        inputSchema: {
            type: 'object',
            properties: {
                resourceName: {
                    type: 'string',
                    description: 'Name of the resource'
                },
                format: {
                    type: 'string',
                    description: 'Export format',
                    enum: ['json', 'ndjson', 'csv'],
                    default: 'json'
                },
                filters: {
                    type: 'object',
                    description: 'Optional filters to export subset of data'
                },
                fields: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Specific fields to export (exports all if not specified)'
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of records to export'
                }
            },
            required: ['resourceName']
        }
    },
    {
        name: 'resourceImport',
        description: 'Import data from JSON or NDJSON format into a resource',
        inputSchema: {
            type: 'object',
            properties: {
                resourceName: {
                    type: 'string',
                    description: 'Name of the resource'
                },
                data: {
                    type: 'array',
                    description: 'Array of documents to import'
                },
                mode: {
                    type: 'string',
                    description: 'Import mode',
                    enum: ['insert', 'upsert', 'replace'],
                    default: 'insert'
                },
                batchSize: {
                    type: 'number',
                    description: 'Batch size for bulk operations',
                    default: 100
                }
            },
            required: ['resourceName', 'data']
        }
    },
    {
        name: 'dbBackupMetadata',
        description: 'Create a backup of the metadata.json file',
        inputSchema: {
            type: 'object',
            properties: {
                timestamp: {
                    type: 'boolean',
                    description: 'Include timestamp in backup name',
                    default: true
                }
            },
            required: []
        }
    }
];
export function createExportImportHandlers(server) {
    return {
        async resourceExport(args, database) {
            server.ensureConnected(database);
            const { resourceName, format = 'json', filters, fields, limit } = args;
            const resource = server.getResource(database, resourceName);
            try {
                // Get data
                let data;
                if (filters) {
                    data = await resource.query(filters, limit ? { limit } : {});
                }
                else if (limit) {
                    data = await resource.list({ limit });
                }
                else {
                    data = await resource.getAll();
                }
                // Filter fields if specified
                if (fields && fields.length > 0) {
                    data = data.map((doc) => {
                        const filtered = {};
                        for (const field of fields) {
                            if (doc[field] !== undefined) {
                                filtered[field] = doc[field];
                            }
                        }
                        return filtered;
                    });
                }
                let exportData;
                let contentType;
                switch (format) {
                    case 'json':
                        exportData = JSON.stringify(data, null, 2);
                        contentType = 'application/json';
                        break;
                    case 'ndjson':
                        exportData = data.map((doc) => JSON.stringify(doc)).join('\n');
                        contentType = 'application/x-ndjson';
                        break;
                    case 'csv':
                        // Simple CSV conversion
                        if (data.length === 0) {
                            exportData = '';
                        }
                        else {
                            const headers = Object.keys(data[0]);
                            const csvRows = [headers.join(',')];
                            for (const doc of data) {
                                const row = headers.map(h => {
                                    const val = doc[h];
                                    if (val === null || val === undefined)
                                        return '';
                                    if (typeof val === 'object')
                                        return JSON.stringify(val);
                                    return String(val).includes(',') ? `"${val}"` : val;
                                });
                                csvRows.push(row.join(','));
                            }
                            exportData = csvRows.join('\n');
                        }
                        contentType = 'text/csv';
                        break;
                    default:
                        throw new Error(`Unsupported format: ${format}`);
                }
                return {
                    success: true,
                    resource: resourceName,
                    format,
                    recordCount: data.length,
                    exportData,
                    contentType,
                    size: exportData.length
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error.message,
                    resource: resourceName,
                    format
                };
            }
        },
        async resourceImport(args, database) {
            server.ensureConnected(database);
            const { resourceName, data, mode = 'insert', batchSize = 100 } = args;
            const resource = server.getResource(database, resourceName);
            try {
                const results = [];
                let processed = 0;
                // Process in batches
                for (let i = 0; i < data.length; i += batchSize) {
                    const batch = data.slice(i, i + batchSize);
                    let batchResults = [];
                    switch (mode) {
                        case 'insert':
                            batchResults = await resource.insertMany(batch);
                            break;
                        case 'upsert':
                            batchResults = await Promise.all(batch.map((doc) => resource.upsert(doc)));
                            break;
                        case 'replace':
                            // Delete all first if first batch
                            if (i === 0) {
                                await resource.deleteAll();
                            }
                            batchResults = await resource.insertMany(batch);
                            break;
                        default:
                            throw new Error(`Unsupported mode: ${mode}`);
                    }
                    results.push(...batchResults);
                    processed += batch.length;
                }
                return {
                    success: true,
                    resource: resourceName,
                    mode,
                    importedCount: results.length,
                    totalRecords: data.length,
                    batchSize
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error.message,
                    resource: resourceName,
                    mode,
                    processed
                };
            }
        },
        async dbBackupMetadata(args, database) {
            server.ensureConnected(database);
            const { timestamp = true } = args;
            try {
                const metadataKey = `${database.keyPrefix}metadata.json`;
                // Read current metadata
                const response = await database.client.getObject({
                    Bucket: database.bucket,
                    Key: metadataKey
                });
                const metadataContent = await response.Body.transformToString();
                // Create backup key
                const backupSuffix = timestamp ? `-backup-${Date.now()}` : '-backup';
                const backupKey = metadataKey.replace('.json', `${backupSuffix}.json`);
                // Save backup
                await database.client.putObject({
                    Bucket: database.bucket,
                    Key: backupKey,
                    Body: metadataContent,
                    ContentType: 'application/json'
                });
                return {
                    success: true,
                    message: 'Metadata backup created',
                    backup: {
                        key: backupKey,
                        bucket: database.bucket,
                        timestamp: new Date().toISOString(),
                        size: metadataContent.length
                    },
                    original: {
                        key: metadataKey
                    }
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    };
}
//# sourceMappingURL=export-import.js.map