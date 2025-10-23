/**
 * Validate Domain Hook
 *
 * Validates that a URL has a valid domain format.
 * This hook can be unit tested in isolation.
 */

/**
 * Validate domain format
 * @param {Object} data - Resource data
 * @param {string} data.domain - Domain to validate
 * @param {string} data.link - Full URL
 * @param {Object} context - Execution context
 * @param {Object} context.log - Logger instance
 * @returns {Promise<Object>} Validated data
 * @throws {Error} If domain is missing or invalid
 */
export async function validateDomain(data, context = {}) {
  const { log = console } = context;

  // Check if domain exists
  if (!data.domain) {
    throw new Error('Domain required for URL');
  }

  // Validate domain format
  // Allows: example.com, subdomain.example.com, multi.level.example.com
  // Rejects: invalid..domain, -invalid.com, .example.com
  const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;

  if (!domainRegex.test(data.domain)) {
    throw new Error(`Invalid domain format: ${data.domain}`);
  }

  // Log successful validation
  log.info?.({ link: data.link, domain: data.domain }, 'URL domain validated');

  return data;
}

export default validateDomain;
