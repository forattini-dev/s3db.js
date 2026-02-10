const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const base = alphabet.length;
const charToValue: Record<string, number> = Object.fromEntries(
  [...alphabet].map((c, i) => [c, i])
);

export const encode = (n: number): string => {
  if (typeof n !== 'number' || isNaN(n)) return 'undefined';
  if (!isFinite(n)) return 'undefined';
  if (n === 0) return alphabet[0]!;
  if (n < 0) return '-' + encode(-Math.floor(n));
  n = Math.floor(n);
  let s = '';
  while (n) {
    s = alphabet[n % base]! + s;
    n = Math.floor(n / base);
  }
  return s;
};

export const decode = (s: string): number => {
  if (typeof s !== 'string') return NaN;
  if (s === '') return 0;
  let negative = false;
  let str = s;
  if (str[0] === '-') {
    negative = true;
    str = str.slice(1);
  }
  let r = 0;
  for (let i = 0; i < str.length; i++) {
    const idx = charToValue[str[i]!];
    if (idx === undefined) return NaN;
    r = r * base + idx;
  }
  return negative ? -r : r;
};

const keyAlphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const keyBase = keyAlphabet.length;
const keyCharToValue: Record<string, number> = Object.fromEntries(
  [...keyAlphabet].map((c, i) => [c, i])
);

/**
 * Case-insensitive key encoder using base36 alphabet (0-9a-z).
 * Safe for S3 metadata keys which are lowercased by AWS.
 */
export const encodeKey = (n: number): string => {
  if (typeof n !== 'number' || isNaN(n)) return 'undefined';
  if (!isFinite(n)) return 'undefined';
  if (n === 0) return keyAlphabet[0]!;
  if (n < 0) return '-' + encodeKey(-Math.floor(n));
  n = Math.floor(n);
  let s = '';
  while (n) {
    s = keyAlphabet[n % keyBase]! + s;
    n = Math.floor(n / keyBase);
  }
  return s;
};

export const decodeKey = (s: string): number => {
  if (typeof s !== 'string') return NaN;
  if (s === '') return 0;
  let negative = false;
  let str = s;
  if (str[0] === '-') {
    negative = true;
    str = str.slice(1);
  }
  let r = 0;
  for (let i = 0; i < str.length; i++) {
    const idx = keyCharToValue[str[i]!];
    if (idx === undefined) return NaN;
    r = r * keyBase + idx;
  }
  return negative ? -r : r;
};

export const encodeDecimal = (n: number): string => {
  if (typeof n !== 'number' || isNaN(n)) return 'undefined';
  if (!isFinite(n)) return 'undefined';
  const negative = n < 0;
  n = Math.abs(n);
  const [intPart, decPart] = n.toString().split('.');
  const encodedInt = encode(Number(intPart));
  if (decPart) {
    return (negative ? '-' : '') + encodedInt + '.' + decPart;
  }
  return (negative ? '-' : '') + encodedInt;
};

export const decodeDecimal = (s: string): number => {
  if (typeof s !== 'string') return NaN;
  let negative = false;
  let str = s;
  if (str[0] === '-') {
    negative = true;
    str = str.slice(1);
  }
  const [intPart, decPart] = str.split('.');
  const decodedInt = decode(intPart!);
  if (isNaN(decodedInt)) return NaN;
  const num = decPart ? Number(decodedInt + '.' + decPart) : decodedInt;
  return negative ? -num : num;
};

/**
 * Fixed-point encoding optimized for normalized values (typically -1 to 1)
 * Common in embeddings, similarity scores, probabilities, etc.
 *
 * Achieves ~77% compression vs encodeDecimal for embedding vectors.
 */
export const encodeFixedPoint = (n: number, precision = 6): string => {
  if (typeof n !== 'number' || isNaN(n)) return 'undefined';
  if (!isFinite(n)) return 'undefined';

  const scale = Math.pow(10, precision);
  const scaled = Math.round(n * scale);

  if (scaled === 0) return '^0';

  const negative = scaled < 0;
  let num = Math.abs(scaled);
  let s = '';

  while (num > 0) {
    s = alphabet[num % base]! + s;
    num = Math.floor(num / base);
  }

  return '^' + (negative ? '-' : '') + s;
};

/**
 * Decodes fixed-point encoded values
 */
export const decodeFixedPoint = (s: string, precision = 6): number => {
  if (typeof s !== 'string') return NaN;
  if (!s.startsWith('^')) return NaN;

  let str = s.slice(1);

  if (str === '0') return 0;

  let negative = false;
  if (str[0] === '-') {
    negative = true;
    str = str.slice(1);
  }

  let r = 0;
  for (let i = 0; i < str.length; i++) {
    const idx = charToValue[str[i]!];
    if (idx === undefined) return NaN;
    r = r * base + idx;
  }

  const scale = Math.pow(10, precision);
  const scaled = negative ? -r : r;
  return scaled / scale;
};

/**
 * Batch encoding for arrays of fixed-point numbers (optimized for embeddings)
 *
 * Achieves ~17% additional compression vs individual encodeFixedPoint by using
 * a single prefix for the entire array instead of one prefix per value.
 */
export const encodeFixedPointBatch = (values: number[], precision = 6): string => {
  if (!Array.isArray(values)) return '';
  if (values.length === 0) return '^[]';

  const scale = Math.pow(10, precision);

  const encoded = values.map(n => {
    if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) return '';

    const scaled = Math.round(n * scale);
    if (scaled === 0) return '0';

    const negative = scaled < 0;
    let num = Math.abs(scaled);
    let s = '';

    while (num > 0) {
      s = alphabet[num % base]! + s;
      num = Math.floor(num / base);
    }

    return (negative ? '-' : '') + s;
  });

  return '^[' + encoded.join(',') + ']';
};

/**
 * Decodes batch-encoded fixed-point arrays
 */
export const decodeFixedPointBatch = (s: string, precision = 6): number[] => {
  if (typeof s !== 'string') return [];
  if (!s.startsWith('^[')) return [];

  const inner = s.slice(2, -1);

  if (inner === '') return [];

  const parts = inner.split(',');
  const scale = Math.pow(10, precision);

  return parts.map(part => {
    if (part === '0') return 0;
    if (part === '') return NaN;

    let negative = false;
    let str = part;
    if (str[0] === '-') {
      negative = true;
      str = str.slice(1);
    }

    let r = 0;
    for (let i = 0; i < str.length; i++) {
      const idx = charToValue[str[i]!];
      if (idx === undefined) return NaN;
      r = r * base + idx;
    }

    const scaled = negative ? -r : r;
    return scaled / scale;
  });
};
