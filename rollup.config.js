import json from '@rollup/plugin-json';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import esbuild, { minify } from 'rollup-plugin-esbuild';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import terser from '@rollup/plugin-terser';
import { readFileSync, copyFileSync, existsSync, mkdirSync, statSync, unlinkSync, readdirSync } from 'fs';
import { dirname, join } from 'path';

// Read package.json to get version
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

export default {
  input: 'src/index.js',

  output: [
    // CommonJS for Node.js (require)
    {
      format: 'cjs',
      file: 'dist/s3db.cjs',
      inlineDynamicImports: true,  // Keep true to generate single file, but mark plugins as external
      exports: 'named', // Only named exports for CJS
      sourcemap: true,
    },
    // ES Modules for modern Node.js and bundlers (import)
    {
      format: 'es',
      file: 'dist/s3db.es.js',
      inlineDynamicImports: true,  // Keep true to generate single file, but mark plugins as external
      exports: 'named',
      sourcemap: true,
    },
  ],

  plugins: [
    commonjs(),
    resolve({
      preferBuiltins: true, // S3DB is Node.js focused
      exportConditions: ['node'], // Target Node.js environment
    }),
    json(),
    // Remove node polyfills - S3DB is Node.js only
    // nodePolyfills not needed for server-side library

    // Copy TypeScript definitions to dist (only once)
    {
      name: 'copy-types',
      buildEnd() {
        const sourceFile = 'src/s3db.d.ts';
        const targetFile = 'dist/s3db.d.ts';
        
        if (existsSync(sourceFile)) {
          // Ensure dist directory exists
          const distDir = dirname(targetFile);
          if (!existsSync(distDir)) {
            mkdirSync(distDir, { recursive: true });
          }
          
          // Only copy if target doesn't exist or source is newer
          let shouldCopy = !existsSync(targetFile);
          if (!shouldCopy) {
            const sourceStats = statSync(sourceFile);
            const targetStats = statSync(targetFile);
            shouldCopy = sourceStats.mtime > targetStats.mtime;
          }
          
          if (shouldCopy) {
            copyFileSync(sourceFile, targetFile);
            console.log(`✅ Copied ${sourceFile} to ${targetFile}`);
          }
        }
      }
    },
    
    // Replace __PACKAGE_VERSION__ with actual version during build
    {
      name: 'version-replacement',
      transform(code, id) {
        if (id.includes('database.class.js')) {
          return code.replace(/__PACKAGE_VERSION__/g, `"${packageJson.version}"`);
        }
        return null;
      }
    },
    
    esbuild({
      sourceMap: true,
      target: 'node18', // Target Node.js 18+ (modern but stable)
      treeShaking: true,
      define: {
        __PACKAGE_VERSION__: `"${packageJson.version}"`
      }
    }),

    // Clean up legacy CommonJS artifacts from previous builds
    {
      name: 'cleanup-legacy-cjs-artifact',
      writeBundle() {
        const legacyArtifacts = ['dist/s3db.cjs.js', 'dist/s3db.cjs.js.map'];
        for (const file of legacyArtifacts) {
          if (existsSync(file)) {
            unlinkSync(file);
          }
        }
      }
    }
  ],

  external: (id) => {
    // Make cloud inventory driver files external EXCEPT base-driver (which is re-exported)
    if ((id.includes('/cloud-inventory/drivers/') || id.includes('\\cloud-inventory\\drivers\\')) && !id.includes('base-driver')) {
      return true;
    }

    // Make peer dependencies external by pattern matching
    if (id.startsWith('@aws-sdk/') && id !== '@aws-sdk/client-s3' && id !== '@aws-sdk/credential-providers' && id !== '@aws-sdk/s3-request-presigner') {
      return true;
    }
    if (id.startsWith('@google-cloud/') || id.startsWith('@azure/') || id.startsWith('@planetscale/') || id.startsWith('@libsql/') || id.startsWith('@tensorflow/') || id.startsWith('@xenova/')) {
      return true;
    }
    // External list (keep for non-scoped packages)
    const externalList = [
      // Core dependencies (bundled with package)
      '@aws-sdk/client-s3',
      '@aws-sdk/credential-providers',
      '@aws-sdk/s3-request-presigner',
      '@modelcontextprotocol/sdk',
      '@supercharge/promise-pool',
      'recker',
      'dotenv',
      'fastest-validator',
      'flat',
      'glob',
      'json-stable-stringify',
      'lodash-es',
      'nanoid',

    // Peer dependencies - AWS SDK Cloud Inventory (user installs - optional)
    '@aws-sdk/client-acm',
    '@aws-sdk/client-api-gateway',
    '@aws-sdk/client-apigatewayv2',
    '@aws-sdk/client-backup',
    '@aws-sdk/client-cloudfront',
    '@aws-sdk/client-cloudtrail',
    '@aws-sdk/client-cloudwatch',
    '@aws-sdk/client-cloudwatch-logs',
    '@aws-sdk/client-cognito-identity-provider',
    '@aws-sdk/client-config-service',
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/client-ec2',
    '@aws-sdk/client-ecr',
    '@aws-sdk/client-ecs',
    '@aws-sdk/client-efs',
    '@aws-sdk/client-eks',
    '@aws-sdk/client-elasticache',
    '@aws-sdk/client-elastic-load-balancing',
    '@aws-sdk/client-elastic-load-balancing-v2',
    '@aws-sdk/client-eventbridge',
    '@aws-sdk/client-iam',
    '@aws-sdk/client-kinesis',
    '@aws-sdk/client-kms',
    '@aws-sdk/client-lambda',
    '@aws-sdk/client-rds',
    '@aws-sdk/client-route-53',
    '@aws-sdk/client-secrets-manager',
    '@aws-sdk/client-sfn',
    '@aws-sdk/client-sns',
    '@aws-sdk/client-sqs',
    '@aws-sdk/client-ssm',
    '@aws-sdk/client-sts',
    '@aws-sdk/client-waf',
    '@aws-sdk/client-wafv2',

    // Peer dependencies - SMTP plugin (user installs - optional)
    'nodemailer',
    'mailparser',
    'smtp-server',
    'handlebars',

    // Peer dependencies - Other plugins (user installs - optional)
    '@google-cloud/bigquery',
    '@google-cloud/compute',
    '@google-cloud/run',
    '@google-cloud/storage',
    '@google-cloud/functions',
    '@google-cloud/container',
    '@google-cloud/sql',
    '@google-cloud/pubsub',
    '@google-cloud/iam',
    '@google-cloud/secret-manager',
    '@google-cloud/kms',
    'google-auth-library',
    '@hono/node-server',
    '@hono/swagger-ui',
    '@libsql/client',
    '@planetscale/database',
    '@tensorflow/tfjs-node',
    '@tensorflow/tfjs-core',
    '@tensorflow/tfjs-layers',
    '@xenova/transformers',
    'amqplib',
    'bcrypt',
    'enquirer',
    'express',
    'hono',
    'ioredis',
    'jose',
    'node-cron',
    'nodemailer',
    'pg',
    'pino',
    'pino-http',
    'pino-pretty',
    'uuid',

    // Peer dependencies - Puppeteer ecosystem (user installs - optional)
    'puppeteer',
    'puppeteer-extra',
    'puppeteer-extra-plugin-stealth',
    'user-agents',
    'ghost-cursor',
    'merge-deep',

    // Peer dependencies - WebSocket (WebSocketPlugin)
    'ws',

    // Peer dependencies - Cloud providers (CloudInventoryPlugin)
    '@azure/identity',
    '@azure/arm-compute',
    '@azure/arm-containerservice',
    '@azure/arm-storage',
    '@azure/arm-network',
    '@azure/arm-cosmosdb',
    '@azure/arm-containerregistry',
    '@azure/arm-dns',
    '@azure/arm-sql',
    '@azure/arm-msi',
    '@vultr/vultr-node',
    '@linode/api-v4',
    '@linode/api-v4/lib/linodes',
    '@linode/api-v4/lib/kubernetes',
    '@linode/api-v4/lib/volumes',
    '@linode/api-v4/lib/nodebalancers',
    '@linode/api-v4/lib/firewalls',
    '@linode/api-v4/lib/vlans',
    '@linode/api-v4/lib/domains',
    '@linode/api-v4/lib/images',
    '@linode/api-v4/lib/object-storage',
    '@linode/api-v4/lib/databases',
    '@linode/api-v4/lib/stackscripts',
    '@linode/api-v4/lib/placement-groups',
    '@alicloud/pop-core',
    'ali-oss',
    'oci-common',
    'oci-core',
    'oci-containerengine',
    'oci-objectstorage',
    'oci-filestorage',
    'oci-loadbalancer',
    'oci-identity',
    'oci-database',
    'oci-dns',
    'digitalocean-js',
    'hcloud-js',
      'cloudflare',
      'mongodb-atlas-api-client',

      // Node.js built-ins
      'crypto',
      'fs/promises',
      'node:crypto',
      'node:fs',
      'node:stream/web',
      'node:zlib',
      'zlib',
      'redis'  // Added redis which was showing as unresolved
    ];

    // Check if id is in the list
    return externalList.includes(id);
  },
};
