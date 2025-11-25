/**
 * Plugin Dependency Validation System
 *
 * Validates that optional plugin dependencies are installed and meet version requirements.
 * This keeps the core s3db.js package lightweight while ensuring plugins work correctly.
 *
 * @example
 * // In a plugin constructor:
 * await requirePluginDependency('postgresql-replicator');
 */

/**
 * Plugin dependency registry
 * Maps plugin identifiers to their required dependencies
 */
export const PLUGIN_DEPENDENCIES = {
  'postgresql-replicator': {
    name: 'PostgreSQL Replicator',
    docsUrl: 'https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/replicator.md',
    dependencies: {
      'pg': {
        version: '^8.0.0',
        description: 'PostgreSQL client for Node.js',
        installCommand: 'pnpm add pg',
        npmUrl: 'https://www.npmjs.com/package/pg'
      }
    }
  },
  'bigquery-replicator': {
    name: 'BigQuery Replicator',
    docsUrl: 'https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/replicator.md',
    dependencies: {
      '@google-cloud/bigquery': {
        version: '^7.0.0',
        description: 'Google Cloud BigQuery SDK',
        installCommand: 'pnpm add @google-cloud/bigquery',
        npmUrl: 'https://www.npmjs.com/package/@google-cloud/bigquery'
      }
    }
  },
  'sqs-replicator': {
    name: 'SQS Replicator',
    docsUrl: 'https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/replicator.md',
    dependencies: {
      '@aws-sdk/client-sqs': {
        version: '^3.0.0',
        description: 'AWS SDK for SQS',
        installCommand: 'pnpm add @aws-sdk/client-sqs',
        npmUrl: 'https://www.npmjs.com/package/@aws-sdk/client-sqs'
      }
    }
  },
  'sqs-consumer': {
    name: 'SQS Queue Consumer',
    docsUrl: 'https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/queue-consumer.md',
    dependencies: {
      '@aws-sdk/client-sqs': {
        version: '^3.0.0',
        description: 'AWS SDK for SQS',
        installCommand: 'pnpm add @aws-sdk/client-sqs',
        npmUrl: 'https://www.npmjs.com/package/@aws-sdk/client-sqs'
      }
    }
  },
  'rabbitmq-consumer': {
    name: 'RabbitMQ Queue Consumer',
    docsUrl: 'https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/queue-consumer.md',
    dependencies: {
      'amqplib': {
        version: '^0.10.0',
        description: 'AMQP 0-9-1 library for RabbitMQ',
        installCommand: 'pnpm add amqplib',
        npmUrl: 'https://www.npmjs.com/package/amqplib'
      }
    }
  },
  'tfstate-plugin': {
    name: 'Tfstate Plugin',
    docsUrl: 'https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/tfstate.md',
    dependencies: {
      'node-cron': {
        version: '^4.0.0',
        description: 'Cron job scheduler for auto-sync functionality',
        installCommand: 'pnpm add node-cron',
        npmUrl: 'https://www.npmjs.com/package/node-cron'
      }
    }
  },
  'api-plugin': {
    name: 'API Plugin',
    docsUrl: 'https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/api.md',
    dependencies: {
      'hono': {
        version: '^4.0.0',
        description: 'Ultra-light HTTP server framework',
        installCommand: 'pnpm add hono',
        npmUrl: 'https://www.npmjs.com/package/hono'
      },
      '@hono/node-server': {
        version: '^1.0.0',
        description: 'Node.js adapter for Hono',
        installCommand: 'pnpm add @hono/node-server',
        npmUrl: 'https://www.npmjs.com/package/@hono/node-server'
      },
      '@hono/swagger-ui': {
        version: '^0.4.0',
        description: 'Swagger UI integration for Hono',
        installCommand: 'pnpm add @hono/swagger-ui',
        npmUrl: 'https://www.npmjs.com/package/@hono/swagger-ui'
      },
      'jose': {
        version: '^5.0.0 || ^6.0.0',
        description: 'Universal JOSE and JWE implementation (for OAuth2 token validation)',
        installCommand: 'pnpm add jose',
        npmUrl: 'https://www.npmjs.com/package/jose'
      }
    }
  },
  'identity-plugin': {
    name: 'Identity Provider Plugin',
    docsUrl: 'https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/identity.md',
    dependencies: {
      'hono': {
        version: '^4.0.0',
        description: 'Ultra-light HTTP server framework',
        installCommand: 'pnpm add hono',
        npmUrl: 'https://www.npmjs.com/package/hono'
      },
      '@hono/node-server': {
        version: '^1.0.0',
        description: 'Node.js adapter for Hono',
        installCommand: 'pnpm add @hono/node-server',
        npmUrl: 'https://www.npmjs.com/package/@hono/node-server'
      },
      'jose': {
        version: '^5.0.0 || ^6.0.0',
        description: 'Universal JOSE and JWE implementation (for RSA key generation and JWT signing)',
        installCommand: 'pnpm add jose',
        npmUrl: 'https://www.npmjs.com/package/jose'
      },
      'bcrypt': {
        version: '^5.1.0 || ^6.0.0',
        description: 'Secure password hashing library',
        installCommand: 'pnpm add bcrypt',
        npmUrl: 'https://www.npmjs.com/package/bcrypt'
      },
      'nodemailer': {
        version: '^6.9.0 || ^7.0.0',
        description: 'Email sending library for password reset and verification',
        installCommand: 'pnpm add nodemailer',
        npmUrl: 'https://www.npmjs.com/package/nodemailer'
      }
    }
  },
  'cloud-inventory-plugin': {
    name: 'Cloud Inventory Plugin',
    docsUrl: 'https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/cloud-inventory.md',
    dependencies: {
      'node-cron': {
        version: '^4.0.0',
        description: 'Cron scheduler for automated discovery',
        installCommand: 'pnpm add node-cron',
        npmUrl: 'https://www.npmjs.com/package/node-cron'
      },
      'flat': {
        version: '^6.0.0',
        description: 'Flatten/unflatten nested objects for cloud resource processing',
        installCommand: 'pnpm add flat',
        npmUrl: 'https://www.npmjs.com/package/flat'
      }
    }
  },
  'ml-plugin': {
    name: 'ML Plugin',
    docsUrl: 'https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/ml-plugin.md',
    dependencies: {
      '@tensorflow/tfjs-node': {
        version: '^4.0.0',
        description: 'TensorFlow.js for Node.js with native bindings',
        installCommand: 'pnpm add @tensorflow/tfjs-node',
        npmUrl: 'https://www.npmjs.com/package/@tensorflow/tfjs-node'
      }
    }
  },
  'puppeteer': {
    name: 'Puppeteer Suite',
    docsUrl: 'https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/puppeteer/README.md',
    dependencies: {
      'puppeteer-extra': {
        version: '^3.3.4',
        description: 'Headless Chrome automation toolkit',
        installCommand: 'pnpm add puppeteer-extra',
        npmUrl: 'https://www.npmjs.com/package/puppeteer-extra'
      },
      'puppeteer-extra-plugin-stealth': {
        version: '^2.11.2',
        description: 'Stealth plugin to evade bot detection',
        installCommand: 'pnpm add puppeteer-extra-plugin-stealth',
        npmUrl: 'https://www.npmjs.com/package/puppeteer-extra-plugin-stealth'
      },
      'user-agents': {
        version: '^2.0.0',
        description: 'Randomized user agent generator',
        installCommand: 'pnpm add user-agents',
        npmUrl: 'https://www.npmjs.com/package/user-agents'
      },
      'ghost-cursor': {
        version: '^1.4.1',
        description: 'Human-like mouse movement generator',
        installCommand: 'pnpm add ghost-cursor',
        npmUrl: 'https://www.npmjs.com/package/ghost-cursor'
      }
    }
  },
  'puppeteer-extra': {
    name: 'puppeteer-extra',
    docsUrl: 'https://github.com/berstend/puppeteer-extra',
    dependencies: {}
  },
  'puppeteer-extra-plugin-stealth': {
    name: 'puppeteer-extra-plugin-stealth',
    docsUrl: 'https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth',
    dependencies: {}
  },
  'user-agents': {
    name: 'user-agents',
    docsUrl: 'https://github.com/intoli/user-agents',
    dependencies: {}
  },
  'ghost-cursor': {
    name: 'ghost-cursor',
    docsUrl: 'https://github.com/Xetera/ghost-cursor',
    dependencies: {}
  },
  'websocket-plugin': {
    name: 'WebSocket Plugin',
    docsUrl: 'https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/websocket.md',
    dependencies: {
      'ws': {
        version: '^8.0.0',
        description: 'WebSocket client and server implementation',
        installCommand: 'pnpm add ws',
        npmUrl: 'https://www.npmjs.com/package/ws'
      },
      'jose': {
        version: '^5.0.0 || ^6.0.0',
        description: 'Universal JOSE and JWE implementation (for JWT token validation)',
        installCommand: 'pnpm add jose',
        npmUrl: 'https://www.npmjs.com/package/jose'
      }
    }
  }
};

/**
 * Simple semver comparison for major version checking
 * @param {string} actual - Actual version (e.g., "8.11.3")
 * @param {string} required - Required version range (e.g., "^8.0.0" or "^5.0.0 || ^6.0.0")
 * @returns {boolean} True if version is compatible
 */
function isVersionCompatible(actual, required) {
  if (!actual || !required) return false;

  // Handle OR operators (||)
  if (required.includes('||')) {
    const ranges = required.split('||').map(r => r.trim());
    return ranges.some(range => isVersionCompatible(actual, range));
  }

  // Remove ^ and ~ prefixes
  const cleanRequired = required.replace(/^[\^~]/, '');

  // Extract major versions
  const actualMajor = parseInt(actual.split('.')[0], 10);
  const requiredMajor = parseInt(cleanRequired.split('.')[0], 10);

  // For ^X.Y.Z, accept any version >= X.Y.Z with same major
  if (required.startsWith('^')) {
    return actualMajor === requiredMajor;
  }

  // For ~X.Y.Z, accept any version >= X.Y.Z with same major.minor
  if (required.startsWith('~')) {
    const actualMinor = parseInt(actual.split('.')[1] || '0', 10);
    const requiredMinor = parseInt(cleanRequired.split('.')[1] || '0', 10);
    return actualMajor === requiredMajor && actualMinor >= requiredMinor;
  }

  // Exact match for unspecified ranges
  return actualMajor >= requiredMajor;
}

/**
 * Try to load a package and get its version
 * @param {string} packageName - NPM package name
 * @returns {Promise<{installed: boolean, version: string|null, error: Error|null}>}
 */
async function tryLoadPackage(packageName) {
  try {
    // Try to import the package
    const pkg = await import(packageName);

    // Try to get version from package.json
    let version = null;
    try {
      const pkgJson = await import(`${packageName}/package.json`, {
        with: { type: 'json' }
      });
      version = pkgJson.default?.version || pkgJson.version || null;
    } catch (e) {
      // Package.json not accessible, version unknown but package exists
      version = 'unknown';
    }

    return { installed: true, version, error: null };
  } catch (error) {
    return { installed: false, version: null, error };
  }
}

/**
 * Validate that a plugin's dependencies are installed and meet version requirements
 * @param {string} pluginId - Plugin identifier from PLUGIN_DEPENDENCIES
 * @param {Object} options - Validation options
 * @param {boolean} options.throwOnError - Throw error if validation fails (default: true)
 * @param {boolean} options.checkVersions - Check version compatibility (default: true)
 * @returns {Promise<{valid: boolean, missing: string[], incompatible: string[], messages: string[]}>}
 * @throws {Error} If throwOnError=true and validation fails
 */
export async function requirePluginDependency(pluginId, options = {}) {
  const {
    throwOnError = true,
    checkVersions = true
  } = options;

  const pluginDef = PLUGIN_DEPENDENCIES[pluginId];

  if (!pluginDef) {
    const error = new Error(
      `Unknown plugin identifier: ${pluginId}. ` +
      `Available plugins: ${Object.keys(PLUGIN_DEPENDENCIES).join(', ')}`
    );
    if (throwOnError) throw error;
    return { valid: false, missing: [], incompatible: [], messages: [error.message] };
  }

  if (process?.env?.S3DB_SKIP_PLUGIN_DEP_CHECK === '1') {
    return { valid: true, missing: [], incompatible: [], messages: [] };
  }

  const missing = [];
  const incompatible = [];
  const messages = [];

  // Check each dependency
  for (const [pkgName, pkgInfo] of Object.entries(pluginDef.dependencies)) {
    const { installed, version, error } = await tryLoadPackage(pkgName);

    if (!installed) {
      missing.push(pkgName);
      messages.push(
        `❌ Missing dependency: ${pkgName}\n` +
        `   Description: ${pkgInfo.description}\n` +
        `   Required: ${pkgInfo.version}\n` +
        `   Install: ${pkgInfo.installCommand}`
      );
      continue;
    }

    // Check version compatibility if requested
    if (checkVersions && version && version !== 'unknown') {
      const compatible = isVersionCompatible(version, pkgInfo.version);

      if (!compatible) {
        incompatible.push(pkgName);
        messages.push(
          `⚠️  Incompatible version: ${pkgName}\n` +
          `   Installed: ${version}\n` +
          `   Required: ${pkgInfo.version}\n` +
          `   Update: ${pkgInfo.installCommand}`
        );
      } else {
        messages.push(
          `✅ ${pkgName}@${version} (compatible with ${pkgInfo.version})`
        );
      }
    } else {
      messages.push(
        `✅ ${pkgName}@${version || 'unknown'} (installed)`
      );
    }
  }

  const valid = missing.length === 0 && incompatible.length === 0;

  // Throw comprehensive error if validation failed
  if (!valid && throwOnError) {
    const depCount = Object.keys(pluginDef.dependencies).length;
    const missingCount = missing.length;
    const incompatCount = incompatible.length;

    const errorMsg = [
      '',
      '╔══════════════════════════════════════════════════════════════════════╗',
      `║  ❌ ${pluginDef.name} - Missing Dependencies  ║`,
      '╚══════════════════════════════════════════════════════════════════════╝',
      '',
      `📦 Plugin: ${pluginId}`,
      `📊 Status: ${depCount - missingCount - incompatCount}/${depCount} dependencies satisfied`,
      '',
      '🔍 Dependency Status:',
      '─────────────────────────────────────────────────────────────────────',
      ...messages,
      '',
      '🚀 Quick Fix - Install Missing Dependencies:',
      '─────────────────────────────────────────────────────────────────────',
      '',
      '  Option 1: Install individually',
      ...Object.entries(pluginDef.dependencies)
        .filter(([pkg]) => missing.includes(pkg) || incompatible.includes(pkg))
        .map(([pkg, info]) => `    ${info.installCommand}`),
      '',
      '  Option 2: Install all at once',
      `    pnpm add ${Object.keys(pluginDef.dependencies).join(' ')}`,
      '',
      '📚 Documentation:',
      `    ${pluginDef.docsUrl}`,
      '',
      '💡 Troubleshooting:',
      '  • If packages are installed but not detected, try:',
      '    1. Delete node_modules and reinstall: rm -rf node_modules && pnpm install',
      '    2. Check Node.js version: node --version (requires Node 18+)',
      '    3. Verify pnpm version: pnpm --version (requires pnpm 8+)',
      '',
      '  • Still having issues? Check:',
      '    - Package.json has correct dependencies listed',
      '    - No conflicting versions in pnpm-lock.yaml',
      '    - File permissions (especially in node_modules/)',
      '',
      '═══════════════════════════════════════════════════════════════════════',
      ''
    ].join('\n');

    const error = new Error(errorMsg);
    error.pluginId = pluginId;
    error.pluginName = pluginDef.name;
    error.missing = missing;
    error.incompatible = incompatible;
    error.docsUrl = pluginDef.docsUrl;

    throw error;
  }

  return { valid, missing, incompatible, messages };
}

/**
 * Check multiple plugin dependencies at once
 * @param {string[]} pluginIds - Array of plugin identifiers
 * @param {Object} options - Validation options
 * @returns {Promise<Map<string, {valid: boolean, missing: string[], incompatible: string[], messages: string[]}>>}
 */
export async function checkPluginDependencies(pluginIds, options = {}) {
  const results = new Map();

  for (const pluginId of pluginIds) {
    const result = await requirePluginDependency(pluginId, {
      ...options,
      throwOnError: false
    });
    results.set(pluginId, result);
  }

  return results;
}

/**
 * Get a report of all plugin dependencies and their status
 * @returns {Promise<string>} Formatted report
 */
export async function getPluginDependencyReport() {
  const pluginIds = Object.keys(PLUGIN_DEPENDENCIES);
  const results = await checkPluginDependencies(pluginIds);

  const lines = [
    '╔═══════════════════════════════════════════════════════════════╗',
    '║           S3DB.JS - Plugin Dependency Status Report          ║',
    '╚═══════════════════════════════════════════════════════════════╝',
    ''
  ];

  for (const [pluginId, result] of results.entries()) {
    const pluginDef = PLUGIN_DEPENDENCIES[pluginId];
    const status = result.valid ? '✅ READY' : '❌ MISSING';

    lines.push(`${status} - ${pluginDef.name}`);

    if (result.messages.length > 0) {
      result.messages.forEach(msg => {
        lines.push(`      ${msg.replace(/\n/g, '\n      ')}`);
      });
    }

    lines.push('');
  }

  const totalPlugins = pluginIds.length;
  const readyPlugins = Array.from(results.values()).filter(r => r.valid).length;

  lines.push('─────────────────────────────────────────────────────────────────');
  lines.push(`Summary: ${readyPlugins}/${totalPlugins} plugins ready to use`);
  lines.push('─────────────────────────────────────────────────────────────────');

  return lines.join('\n');
}

export default requirePluginDependency;
