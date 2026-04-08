import { deflateRaw, inflateRaw } from 'zlib';
import { promisify } from 'util';
import crypto from 'crypto';

const deflateRawAsync = promisify(deflateRaw);
const inflateRawAsync = promisify(inflateRaw);

const BASE85_ALPHABET = '!#$%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_abcdefghijklmnopqrstuvwxyz{|}~';

const BASE85_DECODE_MAP = new Uint8Array(128);
for (let i = 0; i < BASE85_ALPHABET.length; i++) {
  BASE85_DECODE_MAP[BASE85_ALPHABET.charCodeAt(i)] = i;
}

function encodeBase85(buf: Buffer): string {
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

function decodeBase85(encoded: string): Buffer {
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

const DEFLATE_PREFIX = 'z:';
const BASE85_PREFIX = 'z85:';

interface CompressTextPayload {
  value: string;
  level?: number;
  threshold?: number;
  encoding?: 'base64' | 'base85';
}

interface DecompressTextPayload {
  encoded: string;
}

interface CryptoEncryptPayload {
  content: string;
  passphrase: string;
}

interface CryptoDecryptPayload {
  encrypted: string;
  passphrase: string;
}

interface Sha256Payload {
  message: string;
}

interface PasswordHashPayload {
  password: string;
  rounds?: number;
  algorithm?: 'bcrypt' | 'argon2id';
  pepper?: string;
  argon2?: {
    memoryCost?: number;
    timeCost?: number;
    parallelism?: number;
  };
}

interface PasswordVerifyPayload {
  plaintext: string;
  hash: string;
  pepper?: string;
}

interface VectorBatchDistancePayload {
  query: number[];
  vectors: number[][];
  metric: 'cosine' | 'euclidean' | 'manhattan' | 'dotProduct';
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return a.every(v => v === 0) && b.every(v => v === 0) ? 0 : 1;
  }

  return 1 - dot / denominator;
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i]! - b[i]!;
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function manhattanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i]! - b[i]!);
  }
  return sum;
}

function dotProductDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

const DISTANCE_FNS: Record<string, (a: number[], b: number[]) => number> = {
  cosine: cosineDistance,
  euclidean: euclideanDistance,
  manhattan: manhattanDistance,
  dotProduct: dotProductDistance,
};

async function getWebCrypto() {
  return crypto.webcrypto as unknown as {
    subtle: SubtleCrypto;
    getRandomValues<T extends ArrayBufferView | null>(array: T): T;
  };
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const cryptoLib = await getWebCrypto();
  const keyMaterial = new TextEncoder().encode(passphrase);

  const baseKey = await cryptoLib.subtle.importKey(
    'raw', keyMaterial, { name: 'PBKDF2' }, false, ['deriveKey']
  );

  return cryptoLib.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export const backgroundTaskHandlers = {
  async 'compress:text'(payload: CompressTextPayload): Promise<string> {
    const { value, level = 6, threshold = 100, encoding = 'base64' } = payload;
    if (value === null || value === undefined || value === '') return value;

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
  },

  async 'decompress:text'(payload: DecompressTextPayload): Promise<string> {
    const { encoded } = payload;
    if (encoded === null || encoded === undefined || typeof encoded !== 'string') return encoded;

    if (encoded.startsWith(BASE85_PREFIX)) {
      const data = encoded.substring(BASE85_PREFIX.length);
      if (data.length === 0) return '';
      const compressed = decodeBase85(data);
      const result = await inflateRawAsync(compressed);
      return result.toString('utf-8');
    }

    if (encoded.startsWith(DEFLATE_PREFIX)) {
      const data = encoded.substring(DEFLATE_PREFIX.length);
      if (data.length === 0) return '';
      const compressed = Buffer.from(data, 'base64');
      const result = await inflateRawAsync(compressed);
      return result.toString('utf-8');
    }

    return encoded;
  },

  async 'crypto:encrypt'(payload: CryptoEncryptPayload): Promise<string> {
    const cryptoLib = await getWebCrypto();
    const { content, passphrase } = payload;

    const salt = cryptoLib.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt);
    const iv = cryptoLib.getRandomValues(new Uint8Array(12));

    const encodedContent = new TextEncoder().encode(content);
    const encryptedContent = await cryptoLib.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, encodedContent
    );

    const result = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
    result.set(salt);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encryptedContent), salt.length + iv.length);

    return Buffer.from(result).toString('base64');
  },

  async 'crypto:decrypt'(payload: CryptoDecryptPayload): Promise<string> {
    const cryptoLib = await getWebCrypto();
    const { encrypted, passphrase } = payload;

    const data = new Uint8Array(Buffer.from(encrypted, 'base64'));
    const salt = data.slice(0, 16);
    const iv = data.slice(16, 28);
    const ciphertext = data.slice(28);

    const key = await deriveKey(passphrase, salt);
    const decrypted = await cryptoLib.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertext as BufferSource
    );

    return new TextDecoder().decode(decrypted);
  },

  async 'crypto:sha256'(payload: Sha256Payload): Promise<string> {
    const cryptoLib = await getWebCrypto();
    const data = new TextEncoder().encode(payload.message);
    const hashBuffer = await cryptoLib.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async 'password:hash'(payload: PasswordHashPayload): Promise<string> {
    const {
      password,
      rounds = 12,
      algorithm = 'bcrypt',
      pepper,
      argon2: argon2Config,
    } = payload;

    const peppered = pepper ? password + pepper : password;

    if (algorithm === 'argon2id') {
      const argon2 = await import('argon2');
      const mod = (argon2.default || argon2) as any;
      return mod.hash(peppered, {
        type: 2,
        memoryCost: argon2Config?.memoryCost ?? 65536,
        timeCost: argon2Config?.timeCost ?? 3,
        parallelism: argon2Config?.parallelism ?? 4,
      });
    }

    // @ts-expect-error bcrypt has no type declarations
    const bcryptMod = await import('bcrypt');
    const bcrypt = (bcryptMod.default || bcryptMod) as any;
    return bcrypt.hash(peppered, rounds);
  },

  async 'password:verify'(payload: PasswordVerifyPayload): Promise<boolean> {
    const { plaintext, hash, pepper } = payload;
    if (!plaintext || !hash) return false;

    const peppered = pepper ? plaintext + pepper : plaintext;

    if (hash.startsWith('$argon2')) {
      const argon2 = await import('argon2');
      const mod = (argon2.default || argon2) as any;
      return mod.verify(hash, peppered);
    }

    // @ts-expect-error bcrypt has no type declarations
    const bcryptMod = await import('bcrypt');
    const bcrypt = (bcryptMod.default || bcryptMod) as any;
    return bcrypt.compare(peppered, hash);
  },

  async 'vector:batchDistance'(payload: VectorBatchDistancePayload): Promise<number[]> {
    const { query, vectors, metric } = payload;
    const distanceFn = DISTANCE_FNS[metric];
    if (!distanceFn) throw new Error(`Unknown distance metric: ${metric}`);

    const results = new Array<number>(vectors.length);
    for (let i = 0; i < vectors.length; i++) {
      results[i] = distanceFn(query, vectors[i]!);
    }
    return results;
  },
};

export default backgroundTaskHandlers;
