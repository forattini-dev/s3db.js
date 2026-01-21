import { randomFillSync } from 'node:crypto';

const FALLBACK_URL_ALPHABET =
  'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const POOL_SIZE_MULTIPLIER = 128;
let pool: Buffer | undefined;
let poolOffset = 0;

function fillPool(bytes: number): void {
  if (!pool || pool.length < bytes) {
    pool = Buffer.allocUnsafe(bytes * POOL_SIZE_MULTIPLIER);
    randomFillSync(pool);
    poolOffset = 0;
  } else if (poolOffset + bytes > pool.length) {
    randomFillSync(pool);
    poolOffset = 0;
  }
  poolOffset += bytes;
}

function randomFromPool(bytes: number): Buffer {
  bytes |= 0;
  fillPool(bytes);
  return pool!.subarray(poolOffset - bytes, poolOffset);
}

type RandomFunction = (bytes: number) => Buffer;
type CustomAlphabetFunction = (alphabet: string, size?: number) => (size?: number) => string;

function customRandomFallback(
  alphabet: string,
  defaultSize: number,
  getRandom: RandomFunction
): (size?: number) => string {
  const mask = (2 << (31 - Math.clz32((alphabet.length - 1) | 1))) - 1;
  const step = Math.ceil((1.6 * mask * defaultSize) / alphabet.length);

  return (size = defaultSize): string => {
    if (!size) return '';

    let id = '';
    while (true) {
      const bytes = getRandom(step);
      let i = step;
      while (i--) {
        id += alphabet[bytes[i]! & mask] || '';
        if (id.length >= size) return id;
      }
    }
  };
}

function customAlphabetFallback(alphabet: string, size = 21): (size?: number) => string {
  return customRandomFallback(alphabet, size, randomFromPool);
}

let activeCustomAlphabet: CustomAlphabetFunction = customAlphabetFallback;
let activeUrlAlphabet: string = FALLBACK_URL_ALPHABET;
let idGeneratorImpl: (size?: number) => string = activeCustomAlphabet(activeUrlAlphabet, 22);
let passwordGeneratorImpl: (size?: number) => string = activeCustomAlphabet(PASSWORD_ALPHABET, 16);
export const idGenerator = (size?: number): string => idGeneratorImpl(size);

export const passwordGenerator = (size?: number): string => passwordGeneratorImpl(size);

export const getUrlAlphabet = (): string => activeUrlAlphabet;

export const createCustomGenerator = (
  alphabet: string,
  size: number
): ((size?: number) => string) => activeCustomAlphabet(alphabet, size);
