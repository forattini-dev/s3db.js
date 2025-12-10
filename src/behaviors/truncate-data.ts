import { calculateTotalSize, calculateAttributeSizes, calculateUTF8Bytes, calculateEffectiveLimit } from '../concerns/calculator.js';
import { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';
import type { StringRecord } from '../types/common.types.js';
import type {
  BehaviorHandleInsertParams,
  BehaviorHandleUpdateParams,
  BehaviorHandleUpsertParams,
  BehaviorHandleGetParams,
  BehaviorResult,
  BehaviorGetResult
} from './types.js';

const TRUNCATED_FLAG = '$truncated';
const TRUNCATED_FLAG_VALUE = 'true';
const TRUNCATED_FLAG_BYTES = calculateUTF8Bytes(TRUNCATED_FLAG) + calculateUTF8Bytes(TRUNCATED_FLAG_VALUE);

function truncateString(str: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let bytes = encoder.encode(str);
  if (bytes.length <= maxBytes) {
    return str;
  }
  let length = str.length;
  while (length > 0) {
    const truncated = str.substring(0, length);
    bytes = encoder.encode(truncated);
    if (bytes.length <= maxBytes) {
      return truncated;
    }
    length--;
  }
  return '';
}

function truncateValue(value: unknown, maxBytes: number): string {
  if (typeof value === 'string') {
    return truncateString(value, maxBytes);
  } else if (typeof value === 'object' && value !== null) {
    const jsonStr = JSON.stringify(value);
    return truncateString(jsonStr, maxBytes);
  } else {
    const stringValue = String(value);
    return truncateString(stringValue, maxBytes);
  }
}

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

  const resultFields: StringRecord<string> = {};
  let currentSize = 0;
  let truncated = false;

  if (mappedData._v) {
    resultFields._v = mappedData._v;
    currentSize += attributeSizes._v as number;
  }

  for (const [fieldName, size] of sortedFields) {
    if (fieldName === '_v') continue;

    const fieldValue = mappedData[fieldName]!;
    const spaceNeeded = (size as number) + (truncated ? 0 : TRUNCATED_FLAG_BYTES);

    if (currentSize + spaceNeeded <= effectiveLimit) {
      resultFields[fieldName] = fieldValue;
      currentSize += size as number;
    } else {
      const availableSpace = effectiveLimit - currentSize - (truncated ? 0 : TRUNCATED_FLAG_BYTES);
      if (availableSpace > 0) {
        const truncatedValue = truncateValue(fieldValue, availableSpace);
        resultFields[fieldName] = truncatedValue;
        truncated = true;
        currentSize += calculateUTF8Bytes(truncatedValue);
      } else {
        resultFields[fieldName] = '';
        truncated = true;
      }
      break;
    }
  }

  let finalSize = calculateTotalSize(resultFields) + (truncated ? TRUNCATED_FLAG_BYTES : 0);

  while (finalSize > effectiveLimit) {
    const fieldNames = Object.keys(resultFields).filter(f => f !== '_v' && f !== '$truncated');
    if (fieldNames.length === 0) {
      break;
    }

    const lastField = fieldNames[fieldNames.length - 1]!;
    resultFields[lastField] = '';

    finalSize = calculateTotalSize(resultFields) + TRUNCATED_FLAG_BYTES;
    truncated = true;
  }

  if (truncated) {
    resultFields[TRUNCATED_FLAG] = TRUNCATED_FLAG_VALUE;
  }

  return { mappedData: resultFields, body: '' };
}

export async function handleUpdate({ resource, data, mappedData, originalData }: BehaviorHandleUpdateParams): Promise<BehaviorResult> {
  return handleInsert({ resource, data, mappedData, originalData });
}

export async function handleUpsert({ resource, data, mappedData }: BehaviorHandleUpsertParams): Promise<BehaviorResult> {
  return handleInsert({ resource, data, mappedData });
}

export async function handleGet({ metadata, body }: BehaviorHandleGetParams): Promise<BehaviorGetResult> {
  return { metadata, body };
}
