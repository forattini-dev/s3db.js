/**
 * IP Address Encoding/Decoding Utilities
 *
 * Provides compact binary encoding for IPv4 and IPv6 addresses
 * to save space in S3 metadata.
 *
 * Savings:
 * - IPv4: "192.168.1.1" (11-15 chars) → 4 bytes → ~8 chars Base64 (47% savings)
 * - IPv6: "2001:db8::1" (up to 39 chars) → 16 bytes → ~22 chars Base64 (44% savings)
 */

import tryFn from './try-fn.js';

/**
 * Validate IPv4 address format
 * @param {string} ip - IP address string
 * @returns {boolean} True if valid IPv4
 */
export function isValidIPv4(ip) {
  if (typeof ip !== 'string') return false;

  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipv4Regex);

  if (!match) return false;

  // Check each octet is 0-255
  for (let i = 1; i <= 4; i++) {
    const octet = parseInt(match[i], 10);
    if (octet < 0 || octet > 255) return false;
  }

  return true;
}

/**
 * Validate IPv6 address format
 * @param {string} ip - IP address string
 * @returns {boolean} True if valid IPv6
 */
export function isValidIPv6(ip) {
  if (typeof ip !== 'string') return false;

  // IPv6 regex (simplified, covers most cases)
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))$/;

  return ipv6Regex.test(ip);
}

/**
 * Encode IPv4 address to Base64 binary representation
 * @param {string} ip - IPv4 address (e.g., "192.168.1.1")
 * @returns {string} Base64-encoded binary (e.g., "wKgBAQ==")
 */
export function encodeIPv4(ip) {
  if (!isValidIPv4(ip)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }

  const octets = ip.split('.').map(octet => parseInt(octet, 10));
  const buffer = Buffer.from(octets);

  return buffer.toString('base64');
}

/**
 * Decode Base64 binary to IPv4 address
 * @param {string} encoded - Base64-encoded binary
 * @returns {string} IPv4 address (e.g., "192.168.1.1")
 */
export function decodeIPv4(encoded) {
  if (typeof encoded !== 'string') {
    throw new Error('Encoded IPv4 must be a string');
  }

  const [ok, err, result] = tryFn(() => {
    const buffer = Buffer.from(encoded, 'base64');

    if (buffer.length !== 4) {
      throw new Error(`Invalid encoded IPv4 length: ${buffer.length} (expected 4)`);
    }

    return Array.from(buffer).join('.');
  });

  if (!ok) {
    throw new Error(`Failed to decode IPv4: ${err.message}`);
  }

  return result;
}

/**
 * Normalize IPv6 address to full expanded form
 * @param {string} ip - IPv6 address (may be compressed)
 * @returns {string} Expanded IPv6 address
 */
export function expandIPv6(ip) {
  if (!isValidIPv6(ip)) {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }

  // Handle :: expansion
  let expanded = ip;

  // Special case: ::
  if (expanded === '::') {
    return '0000:0000:0000:0000:0000:0000:0000:0000';
  }

  // Expand ::
  if (expanded.includes('::')) {
    const parts = expanded.split('::');
    const leftParts = parts[0] ? parts[0].split(':') : [];
    const rightParts = parts[1] ? parts[1].split(':') : [];
    const missingGroups = 8 - leftParts.length - rightParts.length;

    const middleParts = Array(missingGroups).fill('0');
    expanded = [...leftParts, ...middleParts, ...rightParts].join(':');
  }

  // Pad each group to 4 digits
  const groups = expanded.split(':');
  const paddedGroups = groups.map(group => group.padStart(4, '0'));

  return paddedGroups.join(':');
}

/**
 * Compress IPv6 address (remove leading zeros and use ::)
 * @param {string} ip - Full IPv6 address
 * @returns {string} Compressed IPv6 address
 */
export function compressIPv6(ip) {
  // Remove leading zeros
  let compressed = ip.split(':').map(group => {
    return parseInt(group, 16).toString(16);
  }).join(':');

  // Find longest sequence of consecutive 0 groups
  const zeroSequences = [];
  let currentSequence = { start: -1, length: 0 };

  compressed.split(':').forEach((group, index) => {
    if (group === '0') {
      if (currentSequence.start === -1) {
        currentSequence.start = index;
        currentSequence.length = 1;
      } else {
        currentSequence.length++;
      }
    } else {
      if (currentSequence.length > 0) {
        zeroSequences.push({ ...currentSequence });
        currentSequence = { start: -1, length: 0 };
      }
    }
  });

  if (currentSequence.length > 0) {
    zeroSequences.push(currentSequence);
  }

  // Find longest sequence (must be at least 2 groups)
  const longestSequence = zeroSequences
    .filter(seq => seq.length >= 2)
    .sort((a, b) => b.length - a.length)[0];

  if (longestSequence) {
    const parts = compressed.split(':');
    const before = parts.slice(0, longestSequence.start).join(':');
    const after = parts.slice(longestSequence.start + longestSequence.length).join(':');

    if (before && after) {
      compressed = `${before}::${after}`;
    } else if (before) {
      compressed = `${before}::`;
    } else if (after) {
      compressed = `::${after}`;
    } else {
      compressed = '::';
    }
  }

  return compressed;
}

/**
 * Encode IPv6 address to Base64 binary representation
 *
 * SMART ENCODING: Only encodes if it saves space!
 * - Compressed IPv6 (::1, fe80::1) = 3-20 chars → kept as-is (encoding would expand to 24 chars)
 * - Full notation IPv6 (39+ chars) → encoded to 24 chars (~40% savings)
 *
 * @param {string} ip - IPv6 address (e.g., "2001:db8::1")
 * @returns {string} Base64-encoded binary (24 chars) OR original IP if encoding doesn't help
 */
export function encodeIPv6(ip) {
  if (!isValidIPv6(ip)) {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }

  // SMART DECISION: Only encode if it saves space
  // Binary encoding always produces 24 chars (16 bytes → Base64)
  // Only worth encoding if original > 24 chars
  if (ip.length <= 24) {
    // Compressed form - encoding would EXPAND the data (bad!)
    // Return original to save space
    return ip;
  }

  // Full notation - encoding will COMPRESS the data (good!)
  const expanded = expandIPv6(ip);
  const groups = expanded.split(':');

  // Convert each group to 2 bytes
  const bytes = [];
  for (const group of groups) {
    const value = parseInt(group, 16);
    bytes.push((value >> 8) & 0xFF); // High byte
    bytes.push(value & 0xFF);         // Low byte
  }

  const buffer = Buffer.from(bytes);
  return buffer.toString('base64');
}

/**
 * Decode Base64 binary to IPv6 address
 *
 * SMART DECODING: Detects if input is encoded or original
 * - If exactly 24 chars & valid Base64 → decode binary
 * - Otherwise → return as-is (was kept unencoded to save space)
 *
 * @param {string} encoded - Base64-encoded binary OR original IPv6 (if compressed)
 * @param {boolean} compress - Whether to compress the output (default: true)
 * @returns {string} IPv6 address
 */
export function decodeIPv6(encoded, compress = true) {
  if (typeof encoded !== 'string') {
    throw new Error('Encoded IPv6 must be a string');
  }

  // SMART DETECTION: Check if this is actually encoded
  // Encoded IPv6 is always exactly 24 chars (Base64 of 16 bytes)
  if (encoded.length !== 24) {
    // Not encoded - was kept as original compressed form
    return encoded;
  }

  // Try to decode - if it fails, it's probably an unencoded IPv6
  const [ok, err, result] = tryFn(() => {
    const buffer = Buffer.from(encoded, 'base64');

    if (buffer.length !== 16) {
      throw new Error(`Invalid encoded IPv6 length: ${buffer.length} (expected 16)`);
    }

    const groups = [];
    for (let i = 0; i < 16; i += 2) {
      const value = (buffer[i] << 8) | buffer[i + 1];
      groups.push(value.toString(16).padStart(4, '0'));
    }

    const fullAddress = groups.join(':');

    return compress ? compressIPv6(fullAddress) : fullAddress;
  });

  if (!ok) {
    throw new Error(`Failed to decode IPv6: ${err.message}`);
  }

  return result;
}

/**
 * Detect IP version from string
 * @param {string} ip - IP address string
 * @returns {'ipv4'|'ipv6'|null} IP version or null if invalid
 */
export function detectIPVersion(ip) {
  if (isValidIPv4(ip)) return 'ipv4';
  if (isValidIPv6(ip)) return 'ipv6';
  return null;
}

/**
 * Calculate savings percentage for IP encoding
 * @param {string} ip - IP address
 * @returns {Object} Savings information
 */
export function calculateIPSavings(ip) {
  const version = detectIPVersion(ip);

  if (!version) {
    return { version: null, originalSize: 0, encodedSize: 0, savings: 0 };
  }

  const originalSize = ip.length;
  let encodedSize;

  if (version === 'ipv4') {
    const encoded = encodeIPv4(ip);
    encodedSize = encoded.length;
  } else {
    const encoded = encodeIPv6(ip);
    encodedSize = encoded.length;
  }

  const savings = ((originalSize - encodedSize) / originalSize) * 100;

  return {
    version,
    originalSize,
    encodedSize,
    savings: Math.round(savings * 100) / 100,
    savingsPercent: `${Math.round(savings)}%`
  };
}

export default {
  isValidIPv4,
  isValidIPv6,
  encodeIPv4,
  decodeIPv4,
  encodeIPv6,
  decodeIPv6,
  expandIPv6,
  compressIPv6,
  detectIPVersion,
  calculateIPSavings
};
