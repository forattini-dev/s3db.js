import { tryFnSync } from '../concerns/try-fn.js';
import type { StringRecord } from '../types/common.types.js';
import type {
  BehaviorHandleInsertParams,
  BehaviorHandleUpdateParams,
  BehaviorHandleUpsertParams,
  BehaviorHandleGetParams,
  BehaviorResult,
  BehaviorGetResult
} from './types.js';

export async function handleInsert({ resource, mappedData }: BehaviorHandleInsertParams): Promise<BehaviorResult> {
  const metadataOnly: StringRecord<string> = {
    '_v': mappedData._v || String(resource.version)
  };
  metadataOnly._map = JSON.stringify(resource.schema?.map || {});

  if (resource.schema?.pluginMap && Object.keys(resource.schema.pluginMap).length > 0) {
    metadataOnly._pluginMap = JSON.stringify(resource.schema.pluginMap);
  }

  const body = JSON.stringify(mappedData);

  return { mappedData: metadataOnly, body };
}

export async function handleUpdate({ resource, mappedData }: BehaviorHandleUpdateParams): Promise<BehaviorResult> {
  const metadataOnly: StringRecord<string> = {
    '_v': mappedData._v || String(resource.version)
  };
  metadataOnly._map = JSON.stringify(resource.schema?.map || {});

  if (resource.schema?.pluginMap && Object.keys(resource.schema.pluginMap).length > 0) {
    metadataOnly._pluginMap = JSON.stringify(resource.schema.pluginMap);
  }

  const body = JSON.stringify(mappedData);

  return { mappedData: metadataOnly, body };
}

export async function handleUpsert({ resource, mappedData }: BehaviorHandleUpsertParams): Promise<BehaviorResult> {
  return handleInsert({ resource, data: {}, mappedData });
}

export async function handleGet({ metadata, body }: BehaviorHandleGetParams): Promise<BehaviorGetResult> {
  let bodyData: StringRecord<string> = {};
  if (body && body.trim() !== '') {
    const [ok, , parsed] = tryFnSync(() => JSON.parse(body));
    if (ok) {
      bodyData = parsed as StringRecord<string>;
    }
  }

  const mergedData: StringRecord<string> = {
    ...bodyData,
    ...metadata
  };

  return { metadata: mergedData, body };
}
