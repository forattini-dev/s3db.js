import { deflateRawSync, inflateRawSync, deflateRaw, inflateRaw } from 'zlib';
import { promisify } from 'util';

const deflateRawAsync = promisify(deflateRaw);
const inflateRawAsync = promisify(inflateRaw);

export interface CompressionConfig {
  enabled?: boolean;
  level?: number;
  threshold?: number;
  encoding?: 'base64' | 'base85';
}

export interface CompressionOptions {
  level?: number;
  threshold?: number;
  encoding?: 'base64' | 'base85';
}

export const DEFAULT_COMPRESSION: Required<CompressionConfig> = {
  enabled: false,
  level: 6,
  threshold: 100,
  encoding: 'base64',
};

const BASE85_ALPHABET = '!#$%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_abcdefghijklmnopqrstuvwxyz{|}~';

const BASE85_DECODE_MAP = new Uint8Array(128);
for (let i = 0; i < BASE85_ALPHABET.length; i++) {
  BASE85_DECODE_MAP[BASE85_ALPHABET.charCodeAt(i)] = i;
}

const DEFLATE_PREFIX = 'z:';
const BASE85_PREFIX = 'z85:';

/**
 * Encode a Buffer to base85 using a custom S3-safe alphabet.
 * Every 4 input bytes produce 5 output characters (25% overhead).
 * Padding is encoded in the last group when input length is not a multiple of 4.
 *
 * **Beta**: base85 encoding for S3 metadata is not battle-tested at scale.
 */
export function encodeBase85(buf: Buffer): string {
  const len = buf.length;
  if (len === 0) return '';

  const fullGroups = Math.floor(len / 4);
  const remainder = len % 4;
  const chars: string[] = new Array(fullGroups * 5 + (remainder ? remainder + 1 : 0));
  let ci = 0;

  for (let i = 0; i < fullGroups * 4; i += 4) {
    let val = ((buf[i]! << 24) | (buf[i + 1]! << 16) | (buf[i + 2]! << 8) | buf[i + 3]!) >>> 0;
    for (let j = 4; j >= 0; j--) {
      chars[ci + j] = BASE85_ALPHABET[val % 85]!;
      val = Math.floor(val / 85);
    }
    ci += 5;
  }

  if (remainder > 0) {
    let val = 0;
    const offset = fullGroups * 4;
    for (let i = 0; i < remainder; i++) {
      val = val * 256 + buf[offset + i]!;
    }
    for (let i = 0; i < 4 - remainder; i++) {
      val = val * 256;
    }

    const group: string[] = new Array(5);
    for (let j = 4; j >= 0; j--) {
      group[j] = BASE85_ALPHABET[val % 85]!;
      val = Math.floor(val / 85);
    }
    for (let i = 0; i < remainder + 1; i++) {
      chars[ci++] = group[i]!;
    }
  }

  return chars.join('');
}

/**
 * Decode a base85-encoded string back to a Buffer.
 *
 * **Beta**: base85 encoding for S3 metadata is not battle-tested at scale.
 */
export function decodeBase85(encoded: string): Buffer {
  const len = encoded.length;
  if (len === 0) return Buffer.alloc(0);

  const fullGroups = Math.floor(len / 5);
  const remainder = len % 5;
  const outputLen = fullGroups * 4 + (remainder ? remainder - 1 : 0);
  const result = Buffer.allocUnsafe(outputLen);
  let ri = 0;

  for (let i = 0; i < fullGroups * 5; i += 5) {
    let val = 0;
    for (let j = 0; j < 5; j++) {
      val = val * 85 + BASE85_DECODE_MAP[encoded.charCodeAt(i + j)]!;
    }
    result[ri++] = (val >>> 24) & 0xff;
    result[ri++] = (val >>> 16) & 0xff;
    result[ri++] = (val >>> 8) & 0xff;
    result[ri++] = val & 0xff;
  }

  if (remainder > 0) {
    const offset = fullGroups * 5;
    let val = 0;
    for (let i = 0; i < remainder; i++) {
      val = val * 85 + BASE85_DECODE_MAP[encoded.charCodeAt(offset + i)]!;
    }
    for (let i = 0; i < 5 - remainder; i++) {
      val = val * 85 + 84;
    }

    const bytes = remainder - 1;
    for (let i = 0; i < bytes; i++) {
      result[ri++] = (val >>> (24 - i * 8)) & 0xff;
    }
  }

  return result.subarray(0, ri);
}

/**
 * Compress a string value using deflate + base64 (default) or base85 (beta).
 * Returns the original value unchanged if compression doesn't save space
 * or the value is below the threshold.
 */
export function compressText(value: string, options: CompressionOptions = {}): string {
  if (value === null || value === undefined || value === '') return value;

  const threshold = options.threshold ?? DEFAULT_COMPRESSION.threshold;
  const level = options.level ?? DEFAULT_COMPRESSION.level;
  const encoding = options.encoding ?? DEFAULT_COMPRESSION.encoding;

  const buf = Buffer.from(value, 'utf-8');
  if (buf.length < threshold) return value;

  const compressed = deflateRawSync(buf, { level });

  let encoded: string;
  if (encoding === 'base85') {
    encoded = BASE85_PREFIX + encodeBase85(compressed);
  } else {
    encoded = DEFLATE_PREFIX + compressed.toString('base64');
  }

  if (encoded.length >= buf.length) return value;

  return encoded;
}

/**
 * Decompress a compressed text value.
 * Detects z: (deflate+base64) or z85: (deflate+base85) prefix and decompresses.
 * If no recognized prefix is found, returns the value as-is (adaptive: wasn't compressed).
 */
export function decompressText(encoded: string): string {
  if (encoded === null || encoded === undefined || typeof encoded !== 'string') return encoded;

  if (encoded.startsWith(BASE85_PREFIX)) {
    const payload = encoded.substring(BASE85_PREFIX.length);
    if (payload.length === 0) return '';
    const compressed = decodeBase85(payload);
    return inflateRawSync(compressed).toString('utf-8');
  }

  if (encoded.startsWith(DEFLATE_PREFIX)) {
    const payload = encoded.substring(DEFLATE_PREFIX.length);
    if (payload.length === 0) return '';
    const compressed = Buffer.from(payload, 'base64');
    return inflateRawSync(compressed).toString('utf-8');
  }

  return encoded;
}

export async function compressTextAsync(value: string, options: CompressionOptions = {}): Promise<string> {
  if (value === null || value === undefined || value === '') return value;

  const threshold = options.threshold ?? DEFAULT_COMPRESSION.threshold;
  const level = options.level ?? DEFAULT_COMPRESSION.level;
  const encoding = options.encoding ?? DEFAULT_COMPRESSION.encoding;

  const buf = Buffer.from(value, 'utf-8');
  if (buf.length < threshold) return value;

  const compressed = await deflateRawAsync(buf, { level });

  let encoded: string;
  if (encoding === 'base85') {
    encoded = BASE85_PREFIX + encodeBase85(compressed);
  } else {
    encoded = DEFLATE_PREFIX + compressed.toString('base64');
  }

  if (encoded.length >= buf.length) return value;

  return encoded;
}

export async function decompressTextAsync(encoded: string): Promise<string> {
  if (encoded === null || encoded === undefined || typeof encoded !== 'string') return encoded;

  if (encoded.startsWith(BASE85_PREFIX)) {
    const payload = encoded.substring(BASE85_PREFIX.length);
    if (payload.length === 0) return '';
    const compressed = decodeBase85(payload);
    return (await inflateRawAsync(compressed)).toString('utf-8');
  }

  if (encoded.startsWith(DEFLATE_PREFIX)) {
    const payload = encoded.substring(DEFLATE_PREFIX.length);
    if (payload.length === 0) return '';
    const compressed = Buffer.from(payload, 'base64');
    return (await inflateRawAsync(compressed)).toString('utf-8');
  }

  return encoded;
}
