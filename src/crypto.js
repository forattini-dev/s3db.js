async function dynamicCrypto() {
  let lib

  if (typeof process !== 'undefined') {
    try {
      const { webcrypto } = await import('crypto')
      lib = webcrypto
    } catch (error) {
      throw new Error('Crypto API not available')      
    }
  } else if (typeof window !== 'undefined') {
    lib = window.crypto;
  }

  if (!lib) throw new Error('Could not load any crypto library');
  
  return lib
}

export async function sha256(message) {
  const cryptoLib = await dynamicCrypto();

  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await cryptoLib.subtle.digest('SHA-256', data);

  // Convert buffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

export async function encrypt(content, passphrase) {
  const cryptoLib = await dynamicCrypto();

  const salt = cryptoLib.getRandomValues(new Uint8Array(16)); // Generate a random salt
  const key = await getKeyMaterial(passphrase, salt); // Derive key with salt

  const iv = cryptoLib.getRandomValues(new Uint8Array(12)); // 12-byte IV for AES-GCM

  const encoder = new TextEncoder();
  const encodedContent = encoder.encode(content);

  const encryptedContent = await cryptoLib.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encodedContent);

  const encryptedData = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
  encryptedData.set(salt); // Prepend salt
  encryptedData.set(iv, salt.length); // Prepend IV after salt
  encryptedData.set(new Uint8Array(encryptedContent), salt.length + iv.length); // Append encrypted content

  return arrayBufferToBase64(encryptedData);
}

export async function decrypt(encryptedBase64, passphrase) {
  const cryptoLib = await dynamicCrypto();

  const encryptedData = base64ToArrayBuffer(encryptedBase64);

  const salt = encryptedData.slice(0, 16); // Extract salt (first 16 bytes)
  const iv = encryptedData.slice(16, 28); // Extract IV (next 12 bytes)
  const encryptedContent = encryptedData.slice(28); // Remaining is the encrypted content

  const key = await getKeyMaterial(passphrase, salt); // Derive key with extracted salt

  const decryptedContent = await cryptoLib.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, encryptedContent);

  const decoder = new TextDecoder();
  return decoder.decode(decryptedContent);
}

async function getKeyMaterial(passphrase, salt) {
  const cryptoLib = await dynamicCrypto();

  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(passphrase); // Convert passphrase to bytes

  const baseKey = await cryptoLib.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Derive a key of 256-bit length for AES-GCM using PBKDF2
  return await cryptoLib.subtle.deriveKey(
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
  );
}

function arrayBufferToBase64(buffer) {
  if (typeof process !== 'undefined') {
    // Node.js version
    return Buffer.from(buffer).toString('base64');
  } else {
    // Browser version
    const binary = String.fromCharCode.apply(null, new Uint8Array(buffer));
    return window.btoa(binary);
  }
}

function base64ToArrayBuffer(base64) {
  if (typeof process !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  } else {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
}
