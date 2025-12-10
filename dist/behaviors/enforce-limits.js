import { calculateTotalSize, calculateEffectiveLimit } from '../concerns/calculator.js';
import { MetadataLimitError } from '../errors.js';
export const S3_METADATA_LIMIT_BYTES = 2047;
export async function handleInsert({ resource, data, mappedData }) {
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
        throw new MetadataLimitError('Metadata size exceeds 2KB limit on insert', {
            totalSize,
            effectiveLimit,
            absoluteLimit: S3_METADATA_LIMIT_BYTES,
            excess: totalSize - effectiveLimit,
            resourceName: resource.name,
            operation: 'insert'
        });
    }
    return { mappedData, body: '' };
}
export async function handleUpdate({ resource, id, mappedData }) {
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
        throw new MetadataLimitError('Metadata size exceeds 2KB limit on update', {
            totalSize,
            effectiveLimit,
            absoluteLimit: S3_METADATA_LIMIT_BYTES,
            excess: totalSize - effectiveLimit,
            resourceName: resource.name,
            operation: 'update',
            id
        });
    }
    return { mappedData, body: JSON.stringify(mappedData) };
}
export async function handleUpsert({ resource, id, mappedData }) {
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
        throw new MetadataLimitError('Metadata size exceeds 2KB limit on upsert', {
            totalSize,
            effectiveLimit,
            absoluteLimit: S3_METADATA_LIMIT_BYTES,
            excess: totalSize - effectiveLimit,
            resourceName: resource.name,
            operation: 'upsert',
            id
        });
    }
    return { mappedData, body: '' };
}
export async function handleGet({ metadata, body }) {
    return { metadata, body };
}
//# sourceMappingURL=enforce-limits.js.map