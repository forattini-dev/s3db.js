/**
 * IP Allowlist Checker
 *
 * Validates if an IP address is within allowed ranges (CIDR notation).
 * Used by MetricsPlugin to protect /metrics endpoint.
 *
 * @example
 * isIpAllowed('192.168.1.1', ['192.168.0.0/16'])  // true
 * isIpAllowed('8.8.8.8', ['192.168.0.0/16'])      // false
 */

/**
 * Convert IP address to integer
 * @param {string} ip - IPv4 address
 * @returns {number} IP as integer
 */
function ipToInt(ip) {
  return ip.split('.').reduce((int, octet) => (int << 8) + parseInt(octet, 10), 0) >>> 0;
}

/**
 * Check if IPv6 address
 * @param {string} ip - IP address
 * @returns {boolean}
 */
function isIPv6(ip) {
  return ip.includes(':');
}

/**
 * Normalize IPv6 address (expand :: notation)
 * @param {string} ip - IPv6 address
 * @returns {string} Normalized IPv6
 */
function normalizeIPv6(ip) {
  // Handle IPv4-mapped IPv6 (::ffff:192.168.1.1)
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7); // Return IPv4 part
  }

  // Expand :: notation
  const parts = ip.split('::');
  if (parts.length === 2) {
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    const middle = Array(missing).fill('0000');
    return [...left, ...middle, ...right].join(':');
  }

  return ip;
}

/**
 * Check if IPv6 addresses match
 * @param {string} ip - IPv6 address to check
 * @param {string} range - IPv6 CIDR range
 * @returns {boolean}
 */
function isIPv6InRange(ip, range) {
  const [rangeIp, prefixLen] = range.split('/');
  const prefix = parseInt(prefixLen, 10);

  const normalizedIp = normalizeIPv6(ip);
  const normalizedRange = normalizeIPv6(rangeIp);

  // Convert to binary string and compare prefix bits
  const ipBin = normalizedIp.split(':').map(h => parseInt(h || '0', 16).toString(2).padStart(16, '0')).join('');
  const rangeBin = normalizedRange.split(':').map(h => parseInt(h || '0', 16).toString(2).padStart(16, '0')).join('');

  return ipBin.substring(0, prefix) === rangeBin.substring(0, prefix);
}

/**
 * Check if IPv4 address is in CIDR range
 * @param {string} ip - IPv4 address to check
 * @param {string} range - CIDR range (e.g., "192.168.0.0/16")
 * @returns {boolean}
 */
function isIPv4InRange(ip, range) {
  if (range.includes('/')) {
    const [rangeIp, prefixLen] = range.split('/');
    const prefix = parseInt(prefixLen, 10);
    const mask = (-1 << (32 - prefix)) >>> 0;

    const ipInt = ipToInt(ip);
    const rangeInt = ipToInt(rangeIp);

    return (ipInt & mask) === (rangeInt & mask);
  } else {
    // Exact match (no CIDR)
    return ip === range;
  }
}

/**
 * Check if IP address is in allowlist
 * @param {string} ip - IP address to check
 * @param {string[]} allowlist - Array of allowed IPs/CIDR ranges
 * @returns {boolean}
 */
export function isIpAllowed(ip, allowlist = []) {
  if (!ip || !Array.isArray(allowlist) || allowlist.length === 0) {
    return false;
  }

  // Normalize IP (handle IPv4-mapped IPv6)
  let normalizedIp = ip;
  if (isIPv6(ip)) {
    if (ip.startsWith('::ffff:')) {
      normalizedIp = ip.substring(7); // Extract IPv4
    } else {
      normalizedIp = normalizeIPv6(ip);
    }
  }

  // Check each allowlist entry
  for (const range of allowlist) {
    if (!range) continue;

    // IPv6 range
    if (isIPv6(range)) {
      if (isIPv6(normalizedIp) && isIPv6InRange(normalizedIp, range)) {
        return true;
      }
    }
    // IPv4 range
    else {
      if (!isIPv6(normalizedIp) && isIPv4InRange(normalizedIp, range)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extract client IP from request (handles proxies)
 * @param {Object} c - Hono context
 * @returns {string|null} Client IP address
 */
export function getClientIp(c) {
  // Try X-Forwarded-For header (proxy/load balancer)
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    // Get first IP in chain (original client)
    return forwarded.split(',')[0].trim();
  }

  // Try X-Real-IP header (nginx)
  const realIp = c.req.header('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  // Fallback to connection remote address (Node.js http server)
  // Note: In Hono/Bun, this might not be available
  const req = c.req.raw; // Get underlying Node.js request
  if (req?.socket?.remoteAddress) {
    return req.socket.remoteAddress;
  }

  return null;
}

export default {
  isIpAllowed,
  getClientIp
};
