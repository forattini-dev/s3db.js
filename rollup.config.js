import json from '@rollup/plugin-json';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { dirname, resolve as pathResolve } from 'path';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

function jsToTsResolver() {
  return {
    name: 'js-to-ts-resolver',
    resolveId(source, importer) {
      if (!source.endsWith('.js') || !importer) return null;
      if (!source.startsWith('.') && !source.startsWith('/')) return null;

      const importerDir = dirname(importer);
      const jsPath = pathResolve(importerDir, source);
      const tsPath = jsPath.replace(/\.js$/, '.ts');

      if (!existsSync(jsPath) && existsSync(tsPath)) {
        return tsPath;
      }

      return null;
    }
  };
}

function versionReplacement() {
  return {
    name: 'version-replacement',
    transform(code, id) {
      if (id.includes('database.class.js') || id.includes('database.class.ts')) {
        return code.replace(/__PACKAGE_VERSION__/g, packageJson.version);
      }
      return null;
    }
  };
}

function cleanupLegacyArtifacts() {
  return {
    name: 'cleanup-legacy-cjs-artifact',
    writeBundle() {
      const legacyArtifacts = ['dist/s3db.cjs.js', 'dist/s3db.cjs.js.map'];
      for (const file of legacyArtifacts) {
        if (existsSync(file)) {
          unlinkSync(file);
        }
      }
    }
  };
}

const sharedPlugins = [
  jsToTsResolver(),
  commonjs(),
  resolve({
    preferBuiltins: true,
    exportConditions: ['node'],
    extensions: ['.ts', '.js', '.mjs', '.json']
  }),
  json(),
  typescript({
    tsconfig: './tsconfig.build.json',
    isolatedModules: true,
    module: 'NodeNext',
    moduleResolution: 'NodeNext'
  }),
  versionReplacement()
];

const coreDependencies = [
  '@aws-sdk/client-s3',
  '@aws-sdk/credential-providers',
  '@aws-sdk/s3-request-presigner',
  'fastest-validator',
  'json-stable-stringify',
  'lodash-es',
  'pino',
  'pino-pretty',
  'recker'
];

const optionalDependencies = [
  '@modelcontextprotocol/sdk',
  'dotenv',
  'glob'
];

const allPeerDependencies = [
  // AWS SDK Cloud Inventory
  '@aws-sdk/client-acm', '@aws-sdk/client-api-gateway', '@aws-sdk/client-apigatewayv2',
  '@aws-sdk/client-backup', '@aws-sdk/client-cloudfront', '@aws-sdk/client-cloudtrail',
  '@aws-sdk/client-cloudwatch', '@aws-sdk/client-cloudwatch-logs',
  '@aws-sdk/client-cognito-identity-provider', '@aws-sdk/client-config-service',
  '@aws-sdk/client-dynamodb', '@aws-sdk/client-ec2', '@aws-sdk/client-ecr',
  '@aws-sdk/client-ecs', '@aws-sdk/client-efs', '@aws-sdk/client-eks',
  '@aws-sdk/client-elasticache', '@aws-sdk/client-elastic-load-balancing',
  '@aws-sdk/client-elastic-load-balancing-v2', '@aws-sdk/client-eventbridge',
  '@aws-sdk/client-iam', '@aws-sdk/client-kinesis', '@aws-sdk/client-kms',
  '@aws-sdk/client-lambda', '@aws-sdk/client-rds', '@aws-sdk/client-route-53',
  '@aws-sdk/client-secrets-manager', '@aws-sdk/client-sfn', '@aws-sdk/client-sns',
  '@aws-sdk/client-sqs', '@aws-sdk/client-ssm', '@aws-sdk/client-sts',
  '@aws-sdk/client-waf', '@aws-sdk/client-wafv2',

  // Google Cloud
  '@google-cloud/bigquery', '@google-cloud/compute', '@google-cloud/run',
  '@google-cloud/storage', '@google-cloud/functions', '@google-cloud/container',
  '@google-cloud/sql', '@google-cloud/pubsub', '@google-cloud/iam',
  '@google-cloud/secret-manager', '@google-cloud/kms', 'google-auth-library',

  // Azure
  '@azure/identity', '@azure/arm-compute', '@azure/arm-containerservice',
  '@azure/arm-storage', '@azure/arm-network', '@azure/arm-cosmosdb',
  '@azure/arm-containerregistry', '@azure/arm-dns', '@azure/arm-sql', '@azure/arm-msi',

  // Other cloud providers
  '@vultr/vultr-node', '@alicloud/pop-core', 'ali-oss', 'digitalocean-js', 'hcloud-js',
  'cloudflare', 'mongodb-atlas-api-client',
  '@linode/api-v4', '@linode/api-v4/lib/linodes', '@linode/api-v4/lib/kubernetes',
  '@linode/api-v4/lib/volumes', '@linode/api-v4/lib/nodebalancers',
  '@linode/api-v4/lib/firewalls', '@linode/api-v4/lib/vlans', '@linode/api-v4/lib/domains',
  '@linode/api-v4/lib/images', '@linode/api-v4/lib/object-storage',
  '@linode/api-v4/lib/databases', '@linode/api-v4/lib/stackscripts',
  '@linode/api-v4/lib/placement-groups',
  'oci-common', 'oci-core', 'oci-containerengine', 'oci-objectstorage',
  'oci-filestorage', 'oci-loadbalancer', 'oci-identity', 'oci-database', 'oci-dns',

  // Databases
  'pg', 'redis', 'ioredis', 'mongodb',
  '@libsql/client', '@planetscale/database',

  // HTTP/API
  'hono', '@hono/node-server', '@hono/swagger-ui', 'express', 'jose',

  // Puppeteer ecosystem
  'puppeteer', 'puppeteer-core', 'puppeteer-extra', 'puppeteer-extra-plugin-stealth',
  'user-agents', 'ghost-cursor', 'merge-deep',

  // Other plugins
  'amqplib', 'bcrypt', 'enquirer', 'node-cron', 'nodemailer', 'ws',
  'mailparser', 'smtp-server', 'handlebars', 'pino-http', 'uuid', 'flat',
  '@tensorflow/tfjs-node', '@tensorflow/tfjs-core', '@tensorflow/tfjs-layers',
  '@xenova/transformers', '@supercharge/promise-pool', '@kubernetes/client-node'
];

const nodeBuiltins = [
  'crypto', 'fs/promises', 'node:crypto', 'node:fs', 'node:stream/web', 'node:zlib', 'zlib'
];

function isExternal(id) {
  // Cloud inventory drivers (except base-driver)
  if ((id.includes('/cloud-inventory/drivers/') || id.includes('\\cloud-inventory\\drivers\\')) && !id.includes('base-driver')) {
    return true;
  }

  // AWS SDK (except core S3)
  if (id.startsWith('@aws-sdk/') && !coreDependencies.includes(id)) {
    return true;
  }

  // Scoped packages that are always external
  const externalScopes = ['@google-cloud/', '@azure/', '@planetscale/', '@libsql/', '@tensorflow/', '@xenova/', '@linode/', '@vultr/', '@alicloud/', '@kubernetes/', '@hono/'];
  if (externalScopes.some(scope => id.startsWith(scope))) {
    return true;
  }

  // Check explicit lists
  const allExternal = [...coreDependencies, ...optionalDependencies, ...allPeerDependencies, ...nodeBuiltins];
  return allExternal.includes(id);
}

/**
 * Lite bundle externals - bundles recker to be self-contained for CLI/binaries
 * This ensures the lite bundle works when installed via npm as a transitive dependency
 */
function isExternalLite(id) {
  // Bundle recker into lite for self-contained CLI/binary usage
  if (id === 'recker' || id.startsWith('recker/')) {
    return false;
  }

  // Cloud inventory drivers (except base-driver)
  if ((id.includes('/cloud-inventory/drivers/') || id.includes('\\cloud-inventory\\drivers\\')) && !id.includes('base-driver')) {
    return true;
  }

  // AWS SDK (except core S3)
  if (id.startsWith('@aws-sdk/') && !coreDependencies.includes(id)) {
    return true;
  }

  // Scoped packages that are always external
  const externalScopes = ['@google-cloud/', '@azure/', '@planetscale/', '@libsql/', '@tensorflow/', '@xenova/', '@linode/', '@vultr/', '@alicloud/', '@kubernetes/', '@hono/'];
  if (externalScopes.some(scope => id.startsWith(scope))) {
    return true;
  }

  // Check explicit lists (excluding recker which is bundled)
  const liteDependencies = coreDependencies.filter(dep => dep !== 'recker');
  const allExternal = [...liteDependencies, ...optionalDependencies, ...allPeerDependencies, ...nodeBuiltins];
  return allExternal.includes(id);
}

const fullBundle = {
  input: 'src/index.ts',

  output: [
    {
      format: 'cjs',
      file: 'dist/s3db.cjs',
      inlineDynamicImports: true,
      exports: 'named',
      sourcemap: true,
    },
    {
      format: 'es',
      file: 'dist/s3db.es.js',
      inlineDynamicImports: true,
      exports: 'named',
      sourcemap: true,
    },
  ],

  plugins: [...sharedPlugins, cleanupLegacyArtifacts()],

  external: isExternal,
};

const liteBundle = {
  input: 'src/lite.ts',

  output: [
    {
      format: 'cjs',
      file: 'dist/s3db-lite.cjs',
      inlineDynamicImports: true,
      exports: 'named',
      sourcemap: true,
    },
    {
      format: 'es',
      file: 'dist/s3db-lite.es.js',
      inlineDynamicImports: true,
      exports: 'named',
      sourcemap: true,
    },
  ],

  plugins: [...sharedPlugins],

  // Use isExternalLite to bundle recker for self-contained CLI/binary usage
  external: isExternalLite,
};

export default [fullBundle, liteBundle];
