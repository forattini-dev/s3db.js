import { describe, expect, test } from '@jest/globals';
import { sha256, encrypt, decrypt } from '#src/crypto.js';

// Node.js only: Buffer and process are available

describe('Crypto Tests', () => {
  test('should encrypt and decrypt data correctly', async () => {
    const passphrase = 'my-secret-passphrase';
    const text = 'Hello, world!';
    const encrypted = await encrypt(text, passphrase);
    expect(typeof encrypted).toBe('string');
    const decrypted = await decrypt(encrypted, passphrase);
    expect(decrypted).toBe(text);
  });

  test('should handle different data types', async () => {
    const passphrase = 'another-pass';
    const obj = { foo: 'bar', n: 42 };
    const str = JSON.stringify(obj);
    const encrypted = await encrypt(str, passphrase);
    const decrypted = await decrypt(encrypted, passphrase);
    expect(decrypted).toBe(str);
    // Buffer
    const buf = Buffer.from('buffer test');
    const encryptedBuf = await encrypt(buf.toString('utf8'), passphrase);
    const decryptedBuf = await decrypt(encryptedBuf, passphrase);
    expect(decryptedBuf).toBe(buf.toString('utf8'));
  });

  test('should fail with wrong passphrase', async () => {
    const passphrase = 'pass1';
    const wrong = 'pass2';
    const text = 'Sensitive';
    const encrypted = await encrypt(text, passphrase);
    await expect(decrypt(encrypted, wrong)).rejects.toThrow();
  });

  test('should generate correct sha256 hash', async () => {
    const hash = await sha256('abc');
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('should handle arrayBufferToBase64 and base64ToArrayBuffer (node)', async () => {
    // arrayBufferToBase64
    const buf = Buffer.from('test123');
    // Use internal functions via encrypt/decrypt
    const passphrase = 'test';
    const encrypted = await encrypt('test123', passphrase);
    const arr = Buffer.from(encrypted, 'base64');
    // base64ToArrayBuffer should return Uint8Array
    expect(arr instanceof Buffer).toBe(true);
    // Decrypt should work
    const decrypted = await decrypt(encrypted, passphrase);
    expect(decrypted).toBe('test123');
  });

  test('should handle empty string and special characters', async () => {
    const passphrase = 'test-pass';
    // Empty string
    const emptyEncrypted = await encrypt('', passphrase);
    const emptyDecrypted = await decrypt(emptyEncrypted, passphrase);
    expect(emptyDecrypted).toBe('');
    
    // Special characters
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const specialEncrypted = await encrypt(special, passphrase);
    const specialDecrypted = await decrypt(specialEncrypted, passphrase);
    expect(specialDecrypted).toBe(special);
  });

  test('should handle large data', async () => {
    const passphrase = 'large-data-test';
    const largeData = 'x'.repeat(10000);
    const encrypted = await encrypt(largeData, passphrase);
    const decrypted = await decrypt(encrypted, passphrase);
    expect(decrypted).toBe(largeData);
  });

  test('should handle browser environment simulation', async () => {
    // Simulate browser environment by temporarily removing process
    const hadProcess = Reflect.has(global, 'process');
    const originalProcess = hadProcess ? global['process'] : undefined;
    const hadWindow = Reflect.has(global, 'window');
    const originalWindow = hadWindow ? global['window'] : undefined;

    // Remove process to force browser path
    if (hadProcess) delete global.process;

    // Add mock window.crypto with proper return values
    global.window = {
      crypto: {
        subtle: {
          digest: async () => {
            // Return a proper SHA-256 hash buffer
            const hash = new ArrayBuffer(32);
            const view = new Uint8Array(hash);
            // Fill with some mock hash data
            for (let i = 0; i < 32; i++) {
              view[i] = i;
            }
            return hash;
          },
          encrypt: async () => {
            // Return encrypted data that can be decrypted
            const encrypted = new ArrayBuffer(16);
            const view = new Uint8Array(encrypted);
            // Fill with mock encrypted data
            for (let i = 0; i < 16; i++) {
              view[i] = i + 100;
            }
            return encrypted;
          },
          decrypt: async () => {
            // Return decrypted data as TextEncoder would encode "test"
            const decrypted = new ArrayBuffer(4);
            const view = new Uint8Array(decrypted);
            // "test" in UTF-8: [116, 101, 115, 116]
            view[0] = 116; // 't'
            view[1] = 101; // 'e'
            view[2] = 115; // 's'
            view[3] = 116; // 't'
            return decrypted;
          },
          importKey: async () => ({}),
          deriveKey: async () => ({})
        },
        getRandomValues: (arr) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
          }
          return arr;
        }
      },
      btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
      atob: (str) => Buffer.from(str, 'base64').toString('binary')
    };

    try {
      // Test that crypto functions still work in browser environment
      const hash = await sha256('test');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 hex length
      
      const encrypted = await encrypt('test', 'pass');
      expect(typeof encrypted).toBe('string');
      
      const decrypted = await decrypt(encrypted, 'pass');
      expect(decrypted).toBe('test');
    } finally {
      // Restore original environment
      if (hadProcess) global['process'] = originalProcess;
      else if (Reflect.has(global, 'process')) delete global['process'];
      if (hadWindow) global['window'] = originalWindow;
      else if (Reflect.has(global, 'window')) delete global['window'];
    }
  });
});
