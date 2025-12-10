export interface TaskMetadata {
  signature?: string;
  item?: unknown;
  items?: unknown;
  payload?: unknown;
  body?: unknown;
  data?: unknown;
  value?: unknown;
  itemLength?: number;
  length?: number;
  size?: number;
  [key: string]: unknown;
}

function getFnName(fn: unknown): string {
  if (typeof fn === 'function' && (fn as { name?: string }).name) {
    return (fn as { name: string }).name;
  }
  return 'anonymous';
}

export function extractLengthHint(item: unknown): number | undefined {
  if (item == null) return undefined;
  if (typeof item === 'string' || Array.isArray(item)) {
    return item.length;
  }
  if (typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    if (typeof obj.length === 'number') {
      return obj.length;
    }
    if (typeof obj.size === 'number') {
      return obj.size;
    }
  }
  return undefined;
}

export function deriveSignature(
  fn: unknown,
  metadata: TaskMetadata = {},
  signatureOverride?: string,
  priority: number = 0
): string {
  if (signatureOverride) return signatureOverride;
  if (metadata.signature) return metadata.signature;

  const fnName = getFnName(fn);
  const hintSource =
    metadata.item ??
    metadata.items ??
    metadata.payload ??
    metadata.body ??
    metadata.data ??
    metadata.value;

  const lengthHint =
    metadata.itemLength ??
    metadata.length ??
    (typeof metadata.size === 'number' ? metadata.size : undefined) ??
    extractLengthHint(hintSource);

  const hint = lengthHint != null ? `${fnName}:${lengthHint}` : fnName;
  return `${hint}:p${priority}`;
}
