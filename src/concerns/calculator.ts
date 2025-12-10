const utf8BytesMemory = new Map<string, number>();
const UTF8_MEMORY_MAX_SIZE = 10000;

export function calculateUTF8Bytes(str: unknown): number {
  if (typeof str !== 'string') {
    str = String(str);
  }

  const s = str as string;

  if (utf8BytesMemory.has(s)) {
    return utf8BytesMemory.get(s)!;
  }

  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const codePoint = s.codePointAt(i);

    if (codePoint === undefined) continue;

    if (codePoint <= 0x7F) {
      bytes += 1;
    } else if (codePoint <= 0x7FF) {
      bytes += 2;
    } else if (codePoint <= 0xFFFF) {
      bytes += 3;
    } else if (codePoint <= 0x10FFFF) {
      bytes += 4;
      if (codePoint > 0xFFFF) {
        i++;
      }
    }
  }

  if (utf8BytesMemory.size < UTF8_MEMORY_MAX_SIZE) {
    utf8BytesMemory.set(s, bytes);
  } else if (utf8BytesMemory.size === UTF8_MEMORY_MAX_SIZE) {
    const entriesToDelete = Math.floor(UTF8_MEMORY_MAX_SIZE / 2);
    let deleted = 0;
    for (const key of utf8BytesMemory.keys()) {
      if (deleted >= entriesToDelete) break;
      utf8BytesMemory.delete(key);
      deleted++;
    }
    utf8BytesMemory.set(s, bytes);
  }

  return bytes;
}

export function clearUTF8Memory(): void {
  utf8BytesMemory.clear();
}

export function calculateAttributeNamesSize(mappedObject: Record<string, unknown>): number {
  let totalSize = 0;

  for (const key of Object.keys(mappedObject)) {
    totalSize += calculateUTF8Bytes(key);
  }

  return totalSize;
}

export function transformValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    return value.map(item => String(item)).join('|');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

export function calculateAttributeSizes(mappedObject: Record<string, unknown>): Record<string, number> {
  const sizes: Record<string, number> = {};

  for (const [key, value] of Object.entries(mappedObject)) {
    const transformedValue = transformValue(value);
    const byteSize = calculateUTF8Bytes(transformedValue);
    sizes[key] = byteSize;
  }

  return sizes;
}

export function calculateTotalSize(mappedObject: Record<string, unknown>): number {
  const valueSizes = calculateAttributeSizes(mappedObject);
  const valueTotal = Object.values(valueSizes).reduce((total, size) => total + size, 0);
  const namesSize = calculateAttributeNamesSize(mappedObject);

  return valueTotal + namesSize;
}

export interface SizeBreakdownAttribute {
  attribute: string;
  size: number;
  percentage: string;
}

export interface SizeBreakdown {
  total: number;
  valueSizes: Record<string, number>;
  namesSize: number;
  valueTotal: number;
  breakdown: SizeBreakdownAttribute[];
  detailedBreakdown: {
    values: number;
    names: number;
    total: number;
  };
}

export function getSizeBreakdown(mappedObject: Record<string, unknown>): SizeBreakdown {
  const valueSizes = calculateAttributeSizes(mappedObject);
  const namesSize = calculateAttributeNamesSize(mappedObject);

  const valueTotal = Object.values(valueSizes).reduce((sum, size) => sum + size, 0);
  const total = valueTotal + namesSize;

  const sortedAttributes = Object.entries(valueSizes)
    .sort(([, a], [, b]) => b - a)
    .map(([key, size]) => ({
      attribute: key,
      size,
      percentage: ((size / total) * 100).toFixed(2) + '%'
    }));

  return {
    total,
    valueSizes,
    namesSize,
    valueTotal,
    breakdown: sortedAttributes,
    detailedBreakdown: {
      values: valueTotal,
      names: namesSize,
      total: total
    }
  };
}

export interface SystemOverheadConfig {
  version?: string;
  timestamps?: boolean;
  id?: string;
}

export function calculateSystemOverhead(config: SystemOverheadConfig = {}): number {
  const { version = '1', timestamps = false, id = '' } = config;

  const systemFields: Record<string, string> = {
    '_v': String(version),
  };

  if (timestamps) {
    systemFields.createdAt = '2024-01-01T00:00:00.000Z';
    systemFields.updatedAt = '2024-01-01T00:00:00.000Z';
  }

  if (id) {
    systemFields.id = id;
  }

  const overheadObject: Record<string, string> = {};
  for (const [key, value] of Object.entries(systemFields)) {
    overheadObject[key] = value;
  }

  return calculateTotalSize(overheadObject);
}

export interface EffectiveLimitConfig {
  s3Limit?: number;
  systemConfig?: SystemOverheadConfig;
}

export function calculateEffectiveLimit(config: EffectiveLimitConfig = {}): number {
  const { s3Limit = 2048, systemConfig = {} } = config;
  const overhead = calculateSystemOverhead(systemConfig);
  return s3Limit - overhead;
}
