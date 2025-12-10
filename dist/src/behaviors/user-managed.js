import { calculateTotalSize, calculateEffectiveLimit } from '../concerns/calculator.js';
import { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';
import { tryFn } from '../concerns/try-fn.js';
export async function handleInsert({ resource, data, mappedData, originalData }) {
    const totalSize = calculateTotalSize(mappedData);
    const effectiveLimit = calculateEffectiveLimit({
        s3Limit: S3_METADATA_LIMIT_BYTES,
        systemConfig: {
            version: resource.version,
            timestamps: resource.config.timestamps,
            id: data.id
        }
    });
    if (totalSize > effectiveLimit) {
        resource.emit('exceedsLimit', {
            operation: 'insert',
            totalSize,
            limit: 2047,
            excess: totalSize - 2047,
            data: originalData || data
        });
        const metadataOnly = { _v: mappedData._v };
        if (resource.schema?.pluginMap && Object.keys(resource.schema.pluginMap).length > 0) {
            metadataOnly._pluginMap = JSON.stringify(resource.schema.pluginMap);
        }
        return { mappedData: metadataOnly, body: JSON.stringify(mappedData) };
    }
    return { mappedData, body: '' };
}
export async function handleUpdate({ resource, id, data, mappedData, originalData }) {
    const totalSize = calculateTotalSize(mappedData);
    const effectiveLimit = calculateEffectiveLimit({
        s3Limit: S3_METADATA_LIMIT_BYTES,
        systemConfig: {
            version: resource.version,
            timestamps: resource.config.timestamps,
            id
        }
    });
    if (totalSize > effectiveLimit) {
        resource.emit('exceedsLimit', {
            operation: 'update',
            id,
            totalSize,
            limit: 2047,
            excess: totalSize - 2047,
            data: originalData || data
        });
    }
    return { mappedData, body: JSON.stringify(data) };
}
export async function handleUpsert({ resource, id, data, mappedData }) {
    const totalSize = calculateTotalSize(mappedData);
    const effectiveLimit = calculateEffectiveLimit({
        s3Limit: S3_METADATA_LIMIT_BYTES,
        systemConfig: {
            version: resource.version,
            timestamps: resource.config.timestamps,
            id
        }
    });
    if (totalSize > effectiveLimit) {
        resource.emit('exceedsLimit', {
            operation: 'upsert',
            id,
            totalSize,
            limit: 2047,
            excess: totalSize - 2047,
            data
        });
    }
    return { mappedData, body: JSON.stringify(data) };
}
export async function handleGet({ metadata, body }) {
    if (body && body.trim() !== '') {
        const [ok, , result] = await tryFn(() => {
            const bodyData = JSON.parse(body);
            return {
                metadata: {
                    ...bodyData,
                    ...metadata
                },
                body
            };
        });
        if (ok) {
            return result;
        }
    }
    return { metadata, body };
}
//# sourceMappingURL=user-managed.js.map