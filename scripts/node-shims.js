// Node.js shims for bundled builds
// This helps with compatibility when bundling Node.js code

if (typeof global === 'undefined') {
  window.global = window;
}

if (typeof process === 'undefined') {
  global.process = {
    env: {},
    argv: [],
    version: 'v18.0.0',
    platform: 'linux',
    exit: (code) => {
      if (typeof window !== 'undefined' && window.close) {
        window.close();
      }
    },
    cwd: () => '/',
    nextTick: (fn) => setTimeout(fn, 0),
  };
}

if (typeof Buffer === 'undefined') {
  global.Buffer = {
    from: (data, encoding) => {
      if (typeof data === 'string') {
        return new TextEncoder().encode(data);
      }
      return data;
    },
    alloc: (size) => new Uint8Array(size),
    isBuffer: (obj) => obj instanceof Uint8Array,
  };
}

// Crypto shim
if (typeof crypto === 'undefined' && typeof require !== 'undefined') {
  try {
    global.crypto = require('crypto').webcrypto;
  } catch {
    // Use browser crypto if available
    if (typeof window !== 'undefined' && window.crypto) {
      global.crypto = window.crypto;
    }
  }
}