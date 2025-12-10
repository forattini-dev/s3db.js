export interface FlattenOptions {
  safe?: boolean;
}

export interface UnflattenOptions {
  // For compatibility with flat package
}

type FlattenValue = unknown;
type FlattenResult = Record<string, FlattenValue>;

/**
 * Flatten nested objects into dot-notation keys
 * Lightweight replacement for 'flat' package (only needed features)
 */
export function flatten(obj: unknown, options: FlattenOptions = {}): FlattenResult {
  const { safe = false } = options;
  const result: FlattenResult = {};

  function recurse(current: unknown, path = ''): void {
    if (current === null || current === undefined) {
      result[path] = current;
      return;
    }

    if (safe && Array.isArray(current)) {
      result[path] = current;
      return;
    }

    if (typeof current !== 'object' || current instanceof Date) {
      result[path] = current;
      return;
    }

    if (Array.isArray(current)) {
      if (current.length === 0) {
        result[path] = [];
      } else {
        current.forEach((item, index) => {
          const newPath = path ? `${path}.${index}` : `${index}`;
          recurse(item, newPath);
        });
      }
      return;
    }

    const keys = Object.keys(current as Record<string, unknown>);
    if (keys.length === 0) {
      result[path] = {};
    } else {
      keys.forEach(key => {
        const newPath = path ? `${path}.${key}` : key;
        recurse((current as Record<string, unknown>)[key], newPath);
      });
    }
  }

  recurse(obj);
  return result;
}

/**
 * Unflatten dot-notation keys back into nested objects
 * Lightweight replacement for 'flat' package (only needed features)
 */
export function unflatten(
  obj: Record<string, unknown>,
  _options: UnflattenOptions = {}
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split('.');
    let current: Record<string, unknown> = result;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLast = i === parts.length - 1;

      if (isLast) {
        current[part] = value;
      } else {
        const nextPart = parts[i + 1]!;
        const isNextNumeric = /^\d+$/.test(nextPart);

        if (isNextNumeric) {
          current[part] = current[part] || [];
        } else {
          current[part] = current[part] || {};
        }

        current = current[part] as Record<string, unknown>;
      }
    }
  }

  return result;
}
