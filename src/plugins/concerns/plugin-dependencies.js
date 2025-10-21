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
    dependencies: {
      'pg': {
        version: '^8.0.0',
        description: 'PostgreSQL client for Node.js',
        installCommand: 'pnpm add pg'
      }
    }
  },
  'bigquery-replicator': {
    name: 'BigQuery Replicator',
    dependencies: {
      '@google-cloud/bigquery': {
        version: '^7.0.0',
        description: 'Google Cloud BigQuery SDK',
        installCommand: 'pnpm add @google-cloud/bigquery'
      }
    }
  },
  'sqs-replicator': {
    name: 'SQS Replicator',
    dependencies: {
      '@aws-sdk/client-sqs': {
        version: '^3.0.0',
        description: 'AWS SDK for SQS',
        installCommand: 'pnpm add @aws-sdk/client-sqs'
      }
    }
  },
  'sqs-consumer': {
    name: 'SQS Queue Consumer',
    dependencies: {
      '@aws-sdk/client-sqs': {
        version: '^3.0.0',
        description: 'AWS SDK for SQS',
        installCommand: 'pnpm add @aws-sdk/client-sqs'
      }
    }
  },
  'rabbitmq-consumer': {
    name: 'RabbitMQ Queue Consumer',
    dependencies: {
      'amqplib': {
        version: '^0.10.0',
        description: 'AMQP 0-9-1 library for RabbitMQ',
        installCommand: 'pnpm add amqplib'
      }
    }
  }
};

/**
 * Simple semver comparison for major version checking
 * @param {string} actual - Actual version (e.g., "8.11.3")
 * @param {string} required - Required version range (e.g., "^8.0.0")
 * @returns {boolean} True if version is compatible
 */
function isVersionCompatible(actual, required) {
  if (!actual || !required) return false;

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
        assert: { type: 'json' }
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
    const errorMsg = [
      `\n${pluginDef.name} - Missing dependencies detected!\n`,
      `Plugin ID: ${pluginId}`,
      '',
      ...messages,
      '',
      'Quick fix - Run all install commands:',
      Object.values(pluginDef.dependencies)
        .map(dep => `  ${dep.installCommand}`)
        .join('\n'),
      '',
      'Or install all peer dependencies at once:',
      `  pnpm add ${Object.keys(pluginDef.dependencies).join(' ')}`
    ].join('\n');

    throw new Error(errorMsg);
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
