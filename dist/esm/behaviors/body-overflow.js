import { calculateAttributeSizes, calculateUTF8Bytes } from '../concerns/calculator.js';
import { calculateEffectiveLimit } from '../concerns/calculator.js';
import { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';
import { tryFnSync } from '../concerns/try-fn.js';
const OVERFLOW_FLAG = '$overflow';
const OVERFLOW_FLAG_VALUE = 'true';
const OVERFLOW_FLAG_BYTES = calculateUTF8Bytes(OVERFLOW_FLAG) + calculateUTF8Bytes(OVERFLOW_FLAG_VALUE);
export async function handleInsert({ resource, data, mappedData }) {
    const effectiveLimit = calculateEffectiveLimit({
        s3Limit: S3_METADATA_LIMIT_BYTES,
        systemConfig: {
            version: resource.version,
            timestamps: resource.config.timestamps,
            id: data.id
        }
    });
    const attributeSizes = calculateAttributeSizes(mappedData);
    const sortedFields = Object.entries(attributeSizes)
        .sort(([, a], [, b]) => a - b);
    const metadataFields = {};
    const bodyFields = {};
    let currentSize = 0;
    let willOverflow = false;
    if (mappedData._v) {
        metadataFields._v = mappedData._v;
        currentSize += attributeSizes._v;
    }
    if (resource.schema?.pluginMap && Object.keys(resource.schema.pluginMap).length > 0) {
        const pluginMapStr = JSON.stringify(resource.schema.pluginMap);
        const pluginMapSize = calculateUTF8Bytes('_pluginMap') + calculateUTF8Bytes(pluginMapStr);
        metadataFields._pluginMap = pluginMapStr;
        currentSize += pluginMapSize;
    }
    let reservedLimit = effectiveLimit;
    for (const [fieldName, size] of sortedFields) {
        if (fieldName === '_v')
            continue;
        if (!willOverflow && (currentSize + size > effectiveLimit)) {
            reservedLimit -= OVERFLOW_FLAG_BYTES;
            willOverflow = true;
        }
        if (!willOverflow && (currentSize + size <= reservedLimit)) {
            metadataFields[fieldName] = mappedData[fieldName];
            currentSize += size;
        }
        else {
            bodyFields[fieldName] = mappedData[fieldName];
            willOverflow = true;
        }
    }
    if (willOverflow) {
        metadataFields[OVERFLOW_FLAG] = OVERFLOW_FLAG_VALUE;
    }
    const hasOverflow = Object.keys(bodyFields).length > 0;
    const body = hasOverflow ? JSON.stringify(bodyFields) : '';
    return { mappedData: metadataFields, body };
}
export async function handleUpdate({ resource, data, mappedData }) {
    return handleInsert({ resource, data, mappedData });
}
export async function handleUpsert({ resource, data, mappedData }) {
    return handleInsert({ resource, data, mappedData });
}
export async function handleGet({ metadata, body }) {
    let bodyData = {};
    if (body && body.trim() !== '') {
        const [ok, , parsed] = tryFnSync(() => JSON.parse(body));
        if (ok) {
            bodyData = parsed;
        }
    }
    const mergedData = {
        ...bodyData,
        ...metadata
    };
    delete mergedData.$overflow;
    return { metadata: mergedData, body };
}
//# sourceMappingURL=body-overflow.js.map