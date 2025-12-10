import { calculateTotalSize, calculateAttributeSizes, calculateUTF8Bytes } from '../concerns/calculator.js';
import { calculateEffectiveLimit } from '../concerns/calculator.js';
import { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';
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

const OVERFLOW_FLAG = '$overflow';
const OVERFLOW_FLAG_VALUE = 'true';
const OVERFLOW_FLAG_BYTES = calculateUTF8Bytes(OVERFLOW_FLAG) + calculateUTF8Bytes(OVERFLOW_FLAG_VALUE);

export async function handleInsert({ resource, data, mappedData }: BehaviorHandleInsertParams): Promise<BehaviorResult> {
  const effectiveLimit = calculateEffectiveLimit({
    s3Limit: S3_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id: data.id as string
    }
  });

  const attributeSizes = calculateAttributeSizes(mappedData);
  const sortedFields = Object.entries(attributeSizes)
    .sort(([, a], [, b]) => (a as number) - (b as number));

  const metadataFields: StringRecord<string> = {};
  const bodyFields: StringRecord<string> = {};
  let currentSize = 0;
  let willOverflow = false;

  if (mappedData._v) {
    metadataFields._v = mappedData._v;
    currentSize += attributeSizes._v as number;
  }

  if (resource.schema?.pluginMap && Object.keys(resource.schema.pluginMap).length > 0) {
    const pluginMapStr = JSON.stringify(resource.schema.pluginMap);
    const pluginMapSize = calculateUTF8Bytes('_pluginMap') + calculateUTF8Bytes(pluginMapStr);
    metadataFields._pluginMap = pluginMapStr;
    currentSize += pluginMapSize;
  }

  let reservedLimit = effectiveLimit;
  for (const [fieldName, size] of sortedFields) {
    if (fieldName === '_v') continue;
    if (!willOverflow && (currentSize + (size as number) > effectiveLimit)) {
      reservedLimit -= OVERFLOW_FLAG_BYTES;
      willOverflow = true;
    }
    if (!willOverflow && (currentSize + (size as number) <= reservedLimit)) {
      metadataFields[fieldName] = mappedData[fieldName]!;
      currentSize += size as number;
    } else {
      bodyFields[fieldName] = mappedData[fieldName]!;
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

export async function handleUpdate({ resource, data, mappedData }: BehaviorHandleUpdateParams): Promise<BehaviorResult> {
  return handleInsert({ resource, data, mappedData });
}

export async function handleUpsert({ resource, data, mappedData }: BehaviorHandleUpsertParams): Promise<BehaviorResult> {
  return handleInsert({ resource, data, mappedData });
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

  delete mergedData.$overflow;

  return { metadata: mergedData, body };
}
