/**
 * Example 75: Kubernetes Inventory Plugin - Configuration Methods
 *
 * This example demonstrates all the ways to configure kubeconfig:
 * - Direct file path
 * - Environment variables (file path)
 * - Environment variables (content)
 * - Kubeconfig content string
 * - In-cluster service account
 * - Manual connection object
 * - Context selection
 * - Path expansion (~ and $VAR)
 *
 * Prerequisites:
 * - @kubernetes/client-node installed: pnpm add @kubernetes/client-node
 */

import { Database } from '../../src/database.class.js';
import { KubernetesInventoryPlugin } from '../../src/plugins/kubernetes-inventory.plugin.js';

console.log('📚 Kubernetes Inventory Plugin - Configuration Methods\n');
console.log('This example shows all available configuration methods.\n');
console.log('=' .repeat(80) + '\n');

// ============================================
// METHOD 1: Direct File Path
// ============================================
console.log('METHOD 1: Direct File Path\n');

const method1 = {
  clusters: [
    {
      id: 'local-file',
      name: 'Local Cluster (File Path)',

      // Direct path to kubeconfig file
      kubeconfig: '~/.kube/config',
      // OR: kubeconfig: '/home/user/.kube/config',
      // OR: kubeconfig: '${HOME}/.kube/config',
    }
  ]
};

console.log('Configuration:');
console.log(JSON.stringify(method1, null, 2));
console.log('\n');

// ============================================
// METHOD 2: Environment Variable (File Path)
// ============================================
console.log('METHOD 2: Environment Variable (File Path)\n');

// Set cluster-specific environment variable
// process.env.KUBECONFIG_LOCAL_ENV = '~/.kube/config';
// OR: Standard KUBECONFIG env var (handled by @kubernetes/client-node)
// process.env.KUBECONFIG = '/path/to/kubeconfig';

const method2 = {
  clusters: [
    {
      id: 'local-env',
      name: 'Local Cluster (Env Var Path)',

      // Will look for KUBECONFIG_LOCAL_ENV environment variable
      // If not found, falls back to KUBECONFIG or default
      // No kubeconfig option needed - auto-detected from env vars
    }
  ]
};

console.log('Environment variable pattern:');
console.log('  KUBECONFIG_<CLUSTER_ID> (cluster-specific)');
console.log('  KUBECONFIG (standard)');
console.log('\nExample:');
console.log('  export KUBECONFIG_LOCAL_ENV=~/.kube/config');
console.log('  export KUBECONFIG=/path/to/kubeconfig\n');

console.log('Configuration:');
console.log(JSON.stringify(method2, null, 2));
console.log('\n');

// ============================================
// METHOD 3: Environment Variable (Content)
// ============================================
console.log('METHOD 3: Environment Variable (Content)\n');

// Set kubeconfig content directly in environment
// Base64-encoded (recommended for CI/CD):
// process.env.KUBECONFIG_CONTENT = Buffer.from(kubeconfigYaml).toString('base64');
//
// OR: Plain text (less common):
// process.env.KUBECONFIG_CONTENT = kubeconfigYaml;
//
// OR: Cluster-specific:
// process.env.KUBECONFIG_CONTENT_PROD_VKE = base64EncodedContent;

const method3 = {
  clusters: [
    {
      id: 'prod-vke',
      name: 'Production VKE (Env Content)',

      // Will look for KUBECONFIG_CONTENT_PROD_VKE environment variable
      // Falls back to KUBECONFIG_CONTENT if not found
    }
  ]
};

console.log('Environment variable pattern:');
console.log('  KUBECONFIG_CONTENT_<CLUSTER_ID> (cluster-specific)');
console.log('  KUBECONFIG_CONTENT (global)');
console.log('\nExample (base64):');
console.log('  export KUBECONFIG_CONTENT_PROD_VKE=$(cat ~/.kube/config | base64)');
console.log('\nExample (plain text):');
console.log('  export KUBECONFIG_CONTENT="$(cat ~/.kube/config)"\n');

console.log('Configuration:');
console.log(JSON.stringify(method3, null, 2));
console.log('\n');

// ============================================
// METHOD 4: Direct Content String
// ============================================
console.log('METHOD 4: Direct Content String\n');

const kubeconfigYaml = `
apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://kubernetes.default.svc
    certificate-authority-data: LS0t...
  name: my-cluster
contexts:
- context:
    cluster: my-cluster
    user: my-user
  name: my-context
current-context: my-context
users:
- name: my-user
  user:
    token: eyJhbGci...
`;

const method4 = {
  clusters: [
    {
      id: 'direct-content',
      name: 'Cluster (Direct Content)',

      // Pass kubeconfig as string
      kubeconfigContent: kubeconfigYaml,
    }
  ]
};

console.log('Configuration:');
console.log(JSON.stringify(method4, null, 2).replace(kubeconfigYaml, '<YAML_CONTENT>'));
console.log('\n');

// ============================================
// METHOD 5: Context Selection
// ============================================
console.log('METHOD 5: Context Selection\n');

const method5 = {
  clusters: [
    {
      id: 'prod-context',
      name: 'Production Context',

      // Use specific context from default kubeconfig
      context: 'production-cluster',

      // OR: Use context with specific kubeconfig file
      // kubeconfig: '~/.kube/config',
      // context: 'production-cluster',

      // OR: Use context with environment variable content
      // kubeconfigContent: process.env.KUBECONFIG_CONTENT,
      // context: 'production-cluster',
    }
  ]
};

console.log('Configuration:');
console.log(JSON.stringify(method5, null, 2));
console.log('\nUseful for:');
console.log('  - Multi-cluster kubeconfig files');
console.log('  - Switching between contexts dynamically');
console.log('  - Using minikube, kind, k3d contexts\n');

// ============================================
// METHOD 6: In-Cluster Service Account
// ============================================
console.log('METHOD 6: In-Cluster Service Account\n');

const method6 = {
  clusters: [
    {
      id: 'in-cluster',
      name: 'In-Cluster Service Account',

      // Use service account mounted in pod
      inCluster: true,

      // Service account token is automatically read from:
      // /var/run/secrets/kubernetes.io/serviceaccount/token
    }
  ]
};

console.log('Configuration:');
console.log(JSON.stringify(method6, null, 2));
console.log('\nUseful for:');
console.log('  - Running inside Kubernetes pods');
console.log('  - CI/CD pipelines running in cluster');
console.log('  - No kubeconfig file needed\n');

// ============================================
// METHOD 7: Manual Connection Object
// ============================================
console.log('METHOD 7: Manual Connection Object\n');

const method7 = {
  clusters: [
    {
      id: 'manual',
      name: 'Manual Connection',

      connection: {
        server: 'https://k8s.example.com:6443',

        // Option A: Token authentication
        token: process.env.K8S_TOKEN,
        caData: process.env.K8S_CA_CERT, // Base64-encoded CA cert

        // Option B: Certificate authentication
        // certData: process.env.K8S_CLIENT_CERT, // Base64-encoded
        // keyData: process.env.K8S_CLIENT_KEY,   // Base64-encoded

        // Option C: Skip TLS verification (NOT RECOMMENDED for production)
        // skipTLSVerify: true,
      }
    }
  ]
};

console.log('Configuration:');
console.log(JSON.stringify(method7, null, 2));
console.log('\nUseful for:');
console.log('  - Dynamic cluster connection');
console.log('  - Temporary access tokens');
console.log('  - Custom authentication flows\n');

// ============================================
// METHOD 8: Path Expansion
// ============================================
console.log('METHOD 8: Path Expansion\n');

const method8 = {
  clusters: [
    {
      id: 'expanded',
      name: 'Path Expansion Example',

      // Tilde expansion
      kubeconfig: '~/.kube/config',

      // Environment variable expansion
      // kubeconfig: '${HOME}/.kube/config',
      // kubeconfig: '$HOME/.kube/config',
      // kubeconfig: '${KUBE_CONFIG_DIR}/config',
    }
  ]
};

console.log('Configuration:');
console.log(JSON.stringify(method8, null, 2));
console.log('\nSupported expansions:');
console.log('  ~ → /home/username');
console.log('  ${VAR} → environment variable value');
console.log('  $VAR → environment variable value\n');

// ============================================
// PRIORITY ORDER
// ============================================
console.log('\n' + '='.repeat(80));
console.log('\n📋 Priority Order (Highest to Lowest)\n');
console.log('='.repeat(80) + '\n');

console.log('1. inCluster: true');
console.log('   └─ Use service account in /var/run/secrets/kubernetes.io/serviceaccount/\n');

console.log('2. connection: { ... }');
console.log('   └─ Manual connection object (server, token, certs)\n');

console.log('3. kubeconfigContent (string or env var)');
console.log('   ├─ options.kubeconfigContent (direct)');
console.log('   ├─ KUBECONFIG_CONTENT_<CLUSTER_ID> (cluster-specific)');
console.log('   └─ KUBECONFIG_CONTENT (global)\n');

console.log('4. kubeconfig (file path or env var)');
console.log('   ├─ options.kubeconfig (direct)');
console.log('   ├─ KUBECONFIG_<CLUSTER_ID> (cluster-specific)');
console.log('   └─ Falls through to default (KUBECONFIG env var or ~/.kube/config)\n');

console.log('5. context (with default kubeconfig)');
console.log('   └─ options.context → switches context in default kubeconfig\n');

console.log('6. Default (~/.kube/config or KUBECONFIG env var)');
console.log('   └─ Standard Kubernetes default behavior\n');

// ============================================
// RECOMMENDED PATTERNS
// ============================================
console.log('\n' + '='.repeat(80));
console.log('\n💡 Recommended Patterns\n');
console.log('='.repeat(80) + '\n');

console.log('Local Development:');
console.log('  ✅ kubeconfig: "~/.kube/config"');
console.log('  ✅ context: "minikube" (if using multiple contexts)\n');

console.log('CI/CD Pipelines:');
console.log('  ✅ Environment variable: KUBECONFIG_CONTENT=<base64>');
console.log('  ✅ Cluster-specific: KUBECONFIG_CONTENT_PROD_VKE=<base64>\n');

console.log('In-Cluster (Running inside K8s):');
console.log('  ✅ inCluster: true\n');

console.log('Multi-Cluster:');
console.log('  ✅ Per-cluster env vars: KUBECONFIG_<CLUSTER_ID>');
console.log('  ✅ Per-cluster content: KUBECONFIG_CONTENT_<CLUSTER_ID>\n');

console.log('Temporary/Dynamic Access:');
console.log('  ✅ connection: { server, token } (from secrets/vault)\n');

// ============================================
// EXAMPLE: Complete Multi-Environment Setup
// ============================================
console.log('\n' + '='.repeat(80));
console.log('\n🚀 Complete Multi-Environment Setup Example\n');
console.log('='.repeat(80) + '\n');

const completeExample = {
  clusters: [
    // Local development
    {
      id: 'local',
      kubeconfig: '~/.kube/config',
      context: 'minikube',
      tags: { env: 'local' }
    },

    // Development cluster (from env var)
    {
      id: 'dev',
      // Uses KUBECONFIG_DEV environment variable
      tags: { env: 'dev' }
    },

    // Staging cluster (content from env)
    {
      id: 'staging',
      // Uses KUBECONFIG_CONTENT_STAGING environment variable
      tags: { env: 'staging' }
    },

    // Production cluster (manual connection)
    {
      id: 'prod-vke',
      connection: {
        server: process.env.PROD_K8S_SERVER,
        token: process.env.PROD_K8S_TOKEN,
        caData: process.env.PROD_K8S_CA,
      },
      tags: { env: 'production', region: 'us-east' }
    },

    // In-cluster (when running inside K8s)
    {
      id: 'self',
      inCluster: true,
      tags: { env: 'self' }
    }
  ],

  discovery: {
    runOnInstall: false, // Manual sync
    select: ['core.*', 'apps.*', 'batch.*'],
    ignore: ['*.Event', '*.Lease']
  }
};

console.log(JSON.stringify(completeExample, null, 2));

console.log('\n\nEnvironment variables needed:');
console.log('  KUBECONFIG_DEV=/path/to/dev-kubeconfig');
console.log('  KUBECONFIG_CONTENT_STAGING=<base64-encoded-kubeconfig>');
console.log('  PROD_K8S_SERVER=https://prod-k8s.example.com:6443');
console.log('  PROD_K8S_TOKEN=<service-account-token>');
console.log('  PROD_K8S_CA=<base64-encoded-ca-cert>');

console.log('\n✅ Configuration methods example completed!\n');
