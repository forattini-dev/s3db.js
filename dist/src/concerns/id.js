import { randomFillSync } from 'node:crypto';
import { createLogger } from './logger.js';
const logger = createLogger({ name: 'IdGenerator', level: 'info' });
const FALLBACK_URL_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const POOL_SIZE_MULTIPLIER = 128;
let pool;
let poolOffset = 0;
function fillPool(bytes) {
    if (!pool || pool.length < bytes) {
        pool = Buffer.allocUnsafe(bytes * POOL_SIZE_MULTIPLIER);
        randomFillSync(pool);
        poolOffset = 0;
    }
    else if (poolOffset + bytes > pool.length) {
        randomFillSync(pool);
        poolOffset = 0;
    }
    poolOffset += bytes;
}
function randomFromPool(bytes) {
    bytes |= 0;
    fillPool(bytes);
    return pool.subarray(poolOffset - bytes, poolOffset);
}
function customRandomFallback(alphabet, defaultSize, getRandom) {
    const mask = (2 << (31 - Math.clz32((alphabet.length - 1) | 1))) - 1;
    const step = Math.ceil((1.6 * mask * defaultSize) / alphabet.length);
    return (size = defaultSize) => {
        if (!size)
            return '';
        let id = '';
        while (true) {
            const bytes = getRandom(step);
            let i = step;
            while (i--) {
                id += alphabet[bytes[i] & mask] || '';
                if (id.length >= size)
                    return id;
            }
        }
    };
}
function customAlphabetFallback(alphabet, size = 21) {
    return customRandomFallback(alphabet, size, randomFromPool);
}
let activeCustomAlphabet = customAlphabetFallback;
let activeUrlAlphabet = FALLBACK_URL_ALPHABET;
let idGeneratorImpl = activeCustomAlphabet(activeUrlAlphabet, 22);
let passwordGeneratorImpl = activeCustomAlphabet(PASSWORD_ALPHABET, 16);
let nanoidInitializationError = null;
const nanoidReadyPromise = import('nanoid')
    .then((mod) => {
    const resolvedCustomAlphabet = mod?.customAlphabet ?? activeCustomAlphabet;
    const resolvedUrlAlphabet = mod?.urlAlphabet ?? activeUrlAlphabet;
    activeCustomAlphabet = resolvedCustomAlphabet;
    activeUrlAlphabet = resolvedUrlAlphabet;
    idGeneratorImpl = activeCustomAlphabet(activeUrlAlphabet, 22);
    passwordGeneratorImpl = activeCustomAlphabet(PASSWORD_ALPHABET, 16);
})
    .catch((error) => {
    nanoidInitializationError = error;
    if (typeof process !== 'undefined' && process?.env?.S3DB_DEBUG) {
        logger.warn({ error: error.message }, 'Failed to dynamically import "nanoid". Using fallback implementation.');
    }
});
export function initializeNanoid() {
    return nanoidReadyPromise;
}
export function getNanoidInitializationError() {
    return nanoidInitializationError;
}
export const idGenerator = (size) => idGeneratorImpl(size);
export const passwordGenerator = (size) => passwordGeneratorImpl(size);
export const getUrlAlphabet = () => activeUrlAlphabet;
export const createCustomGenerator = (alphabet, size) => activeCustomAlphabet(alphabet, size);
//# sourceMappingURL=id.js.map