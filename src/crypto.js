import tryFn, { tryFnSync } from "./concerns/try-fn.js";
import { CryptoError } from "./errors.js";

async function dynamicCrypto() {
  let lib;

  if (typeof process !== 'undefined') {
    const [ok, err, result] = await tryFn(async () => {
      const { webcrypto } = await import('crypto');
      return webcrypto;
    });
    if (ok) {
      lib = result;
    } else {
      throw new CryptoError('Crypto API not available', { original: err, context: 'dynamicCrypto' });
    }
  } else if (typeof window !== 'undefined') {
    lib = window.crypto;
  }

  if (!lib) throw new CryptoError('Could not load any crypto library', { context: 'dynamicCrypto' });
  return lib;
}

export async function sha256(message) {
  const [okCrypto, errCrypto, cryptoLib] = await tryFn(dynamicCrypto);
  if (!okCrypto) throw new CryptoError('Crypto API not available', { original: errCrypto });

  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const [ok, err, hashBuffer] = await tryFn(() => cryptoLib.subtle.digest('SHA-256', data));
  if (!ok) throw new CryptoError('SHA-256 digest failed', { original: err, input: message });

  // Convert buffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

export async function encrypt(content, passphrase) {
  const [okCrypto, errCrypto, cryptoLib] = await tryFn(dynamicCrypto);
  if (!okCrypto) throw new CryptoError('Crypto API not available', { original: errCrypto });

  const salt = cryptoLib.getRandomValues(new Uint8Array(16)); // Generate a random salt
  const [okKey, errKey, key] = await tryFn(() => getKeyMaterial(passphrase, salt));
  if (!okKey) throw new CryptoError('Key derivation failed', { original: errKey, passphrase, salt });

  const iv = cryptoLib.getRandomValues(new Uint8Array(12)); // 12-byte IV for AES-GCM

  const encoder = new TextEncoder();
  const encodedContent = encoder.encode(content);

  const [okEnc, errEnc, encryptedContent] = await tryFn(() => cryptoLib.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encodedContent));
  if (!okEnc) throw new CryptoError('Encryption failed', { original: errEnc, content });

  const encryptedData = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
  encryptedData.set(salt); // Prepend salt
  encryptedData.set(iv, salt.length); // Prepend IV after salt
  encryptedData.set(new Uint8Array(encryptedContent), salt.length + iv.length); // Append encrypted content

  return arrayBufferToBase64(encryptedData);
}

export async function decrypt(encryptedBase64, passphrase) {
  const [okCrypto, errCrypto, cryptoLib] = await tryFn(dynamicCrypto);
  if (!okCrypto) throw new CryptoError('Crypto API not available', { original: errCrypto });

  const encryptedData = base64ToArrayBuffer(encryptedBase64);

  const salt = encryptedData.slice(0, 16); // Extract salt (first 16 bytes)
  const iv = encryptedData.slice(16, 28); // Extract IV (next 12 bytes)
  const encryptedContent = encryptedData.slice(28); // Remaining is the encrypted content

  const [okKey, errKey, key] = await tryFn(() => getKeyMaterial(passphrase, salt));
  if (!okKey) throw new CryptoError('Key derivation failed (decrypt)', { original: errKey, passphrase, salt });

  const [okDec, errDec, decryptedContent] = await tryFn(() => cryptoLib.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, encryptedContent));
  if (!okDec) throw new CryptoError('Decryption failed', { original: errDec, encryptedBase64 });

  const decoder = new TextDecoder();
  return decoder.decode(decryptedContent);
}

async function getKeyMaterial(passphrase, salt) {
  const [okCrypto, errCrypto, cryptoLib] = await tryFn(dynamicCrypto);
  if (!okCrypto) throw new CryptoError('Crypto API not available', { original: errCrypto });

  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(passphrase); // Convert passphrase to bytes

  const [okImport, errImport, baseKey] = await tryFn(() => cryptoLib.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  ));
  if (!okImport) throw new CryptoError('importKey failed', { original: errImport, passphrase });

  const [okDerive, errDerive, derivedKey] = await tryFn(() => cryptoLib.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  ));
  if (!okDerive) throw new CryptoError('deriveKey failed', { original: errDerive, passphrase, salt });
  return derivedKey;
}

function arrayBufferToBase64(buffer) {
  if (typeof process !== 'undefined') {
    // Node.js version
    return Buffer.from(buffer).toString('base64');
  } else {
    // Browser version
    const [ok, err, binary] = tryFnSync(() => String.fromCharCode.apply(null, new Uint8Array(buffer)));
    if (!ok) throw new CryptoError('Failed to convert ArrayBuffer to base64 (browser)', { original: err });
    return window.btoa(binary);
  }
}

function base64ToArrayBuffer(base64) {
  if (typeof process !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  } else {
    const [ok, err, binaryString] = tryFnSync(() => window.atob(base64));
    if (!ok) throw new CryptoError('Failed to decode base64 (browser)', { original: err });
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
}
