import {
  encode as toBase62, 
  decode as fromBase62, 
  encodeDecimal, 
  decodeDecimal,
} from '#src/concerns/base62.js';

describe('base62 encode/decode', () => {
  test('encodes and decodes 0', () => {
    expect(toBase62(0)).toBe('0');
    expect(fromBase62('0')).toBe(0);
  });

  test('encodes and decodes small positive integers', () => {
    for (let i = 0; i < 100; i++) {
      const encoded = toBase62(i);
      const decoded = fromBase62(encoded);
      expect(decoded).toBe(i);
    }
  });

  test('encodes and decodes large positive integers', () => {
    const nums = [1234, 99999, 123456789, Number.MAX_SAFE_INTEGER];
    nums.forEach(n => {
      const encoded = toBase62(n);
      const decoded = fromBase62(encoded);
      expect(decoded).toBe(n);
    });
  });

  test('encodes and decodes all single digits, lowercase, and uppercase', () => {
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < alphabet.length; i++) {
      expect(toBase62(i)).toBe(alphabet[i]);
      expect(fromBase62(alphabet[i])).toBe(i);
    }
  });

  test('round-trip for a range of values', () => {
    for (let i = 0; i < 10000; i += 123) {
      const encoded = toBase62(i);
      const decoded = fromBase62(encoded);
      expect(decoded).toBe(i);
    }
  });

  test('decodes multi-character strings', () => {
    expect(fromBase62('10')).toBe(62);
    // '1z' in base62 is 1*62 + 35 = 97
    expect(fromBase62('1z')).toBe(97);
    // round-trip for 123
    const encoded123 = toBase62(123);
    expect(fromBase62(encoded123)).toBe(123);
    expect(fromBase62('ZZ')).toBe(3843);
  });

  test('encodes negatives (should return string with minus, decode returns negative)', () => {
    expect(toBase62(-1)[0]).toBe('-');
    expect(fromBase62('-1')).toBe(-1);
  });

  test('encodes floats (should treat as int)', () => {
    expect(toBase62(3.14)).toBe('3');
    expect(fromBase62('3')).toBe(3);
  });

  test('decoding invalid strings returns NaN', () => {
    expect(fromBase62('!@#')).toBeNaN();
    expect(fromBase62('')).toBe(0);
    expect(fromBase62(' ')).toBeNaN();
  });

  test('encode non-number returns string', () => {
    expect(typeof toBase62('abc')).toBe('string');
    // Should not throw, but result is not meaningful
  });

  test('decode non-string returns NaN', () => {
    expect(fromBase62(null)).toBeNaN();
    expect(fromBase62(undefined)).toBeNaN();
    expect(fromBase62(123)).toBeNaN();
  });

  // New tests to cover missing lines
  test('encode with Infinity and -Infinity should return undefined', () => {
    expect(toBase62(Infinity)).toBe('undefined');
    expect(toBase62(-Infinity)).toBe('undefined');
  });

  test('encodeDecimal with Infinity and -Infinity should return undefined', () => {
    expect(encodeDecimal(Infinity)).toBe('undefined');
    expect(encodeDecimal(-Infinity)).toBe('undefined');
  });

  test('encodeDecimal with NaN should return undefined', () => {
    expect(encodeDecimal(NaN)).toBe('undefined');
  });

  test('encodeDecimal with non-number should return undefined', () => {
    expect(encodeDecimal('abc')).toBe('undefined');
    expect(encodeDecimal(null)).toBe('undefined');
    expect(encodeDecimal(undefined)).toBe('undefined');
  });
});

describe('base62 decimal encode/decode', () => {
  test('encodes and decodes integers as decimals', () => {
    expect(encodeDecimal(123)).toBe(toBase62(123));
    expect(decodeDecimal(toBase62(123))).toBe(123);
  });
  test('encodes and decodes positive floats', () => {
    expect(encodeDecimal(123.456)).toBe(toBase62(123) + '.456');
    expect(decodeDecimal(toBase62(123) + '.456')).toBeCloseTo(123.456);
  });
  test('encodes and decodes negative floats', () => {
    expect(encodeDecimal(-42.99)).toBe('-' + toBase62(42) + '.99');
    expect(decodeDecimal('-' + toBase62(42) + '.99')).toBeCloseTo(-42.99);
  });
  test('encodes and decodes zero', () => {
    expect(encodeDecimal(0)).toBe('0');
    expect(decodeDecimal('0')).toBe(0);
  });
  test('encodes and decodes float with no decimal part', () => {
    expect(encodeDecimal(77.0)).toBe(toBase62(77));
    expect(decodeDecimal(toBase62(77))).toBe(77);
  });
  test('invalid input returns undefined or NaN', () => {
    expect(encodeDecimal('abc')).toBe('undefined');
    expect(decodeDecimal('not@decimal')).toBeNaN();
  });
});

