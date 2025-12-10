import { tryFnSync } from '../concerns/try-fn.js';
export async function handleInsert({ resource, mappedData }) {
    const metadataOnly = {
        '_v': mappedData._v || String(resource.version)
    };
    metadataOnly._map = JSON.stringify(resource.schema?.map || {});
    if (resource.schema?.pluginMap && Object.keys(resource.schema.pluginMap).length > 0) {
        metadataOnly._pluginMap = JSON.stringify(resource.schema.pluginMap);
    }
    const body = JSON.stringify(mappedData);
    return { mappedData: metadataOnly, body };
}
export async function handleUpdate({ resource, mappedData }) {
    const metadataOnly = {
        '_v': mappedData._v || String(resource.version)
    };
    metadataOnly._map = JSON.stringify(resource.schema?.map || {});
    if (resource.schema?.pluginMap && Object.keys(resource.schema.pluginMap).length > 0) {
        metadataOnly._pluginMap = JSON.stringify(resource.schema.pluginMap);
    }
    const body = JSON.stringify(mappedData);
    return { mappedData: metadataOnly, body };
}
export async function handleUpsert({ resource, mappedData }) {
    return handleInsert({ resource, data: {}, mappedData });
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
    return { metadata: mergedData, body };
}
//# sourceMappingURL=body-only.js.map