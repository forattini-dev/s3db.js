/**
 * Flatten nested objects into dot-notation keys
 * Lightweight replacement for 'flat' package (only needed features)
 *
 * @param {Object} obj - Object to flatten
 * @param {Object} options - Options
 * @param {boolean} options.safe - Safe mode (preserve arrays)
 * @returns {Object} Flattened object
 */
export function flatten(obj, options = {}) {
  const { safe = false } = options;
  const result = {};

  function recurse(current, path = '') {
    if (current === null || current === undefined) {
      result[path] = current;
      return;
    }

    // In safe mode, preserve arrays
    if (safe && Array.isArray(current)) {
      result[path] = current;
      return;
    }

    // Handle non-object primitives
    if (typeof current !== 'object' || current instanceof Date) {
      result[path] = current;
      return;
    }

    // Handle arrays (non-safe mode)
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

    // Handle objects
    const keys = Object.keys(current);
    if (keys.length === 0) {
      result[path] = {};
    } else {
      keys.forEach(key => {
        const newPath = path ? `${path}.${key}` : key;
        recurse(current[key], newPath);
      });
    }
  }

  recurse(obj);
  return result;
}

/**
 * Unflatten dot-notation keys back into nested objects
 * Lightweight replacement for 'flat' package (only needed features)
 *
 * @param {Object} obj - Flattened object with dot-notation keys
 * @param {Object} options - Options (for compatibility, not used)
 * @returns {Object} Nested object
 */
export function unflatten(obj, options = {}) {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split('.');
    let current = result;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast) {
        current[part] = value;
      } else {
        // Check if next part is numeric (array index)
        const nextPart = parts[i + 1];
        const isNextNumeric = /^\d+$/.test(nextPart);

        if (isNextNumeric) {
          current[part] = current[part] || [];
        } else {
          current[part] = current[part] || {};
        }

        current = current[part];
      }
    }
  }

  return result;
}
