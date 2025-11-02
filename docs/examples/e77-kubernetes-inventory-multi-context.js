/**
 * Example 77: Kubernetes Inventory Plugin - Multi-Context Kubeconfig
 *
 * This example demonstrates how to use a single kubeconfig file (or content)
 * with multiple contexts to manage different clusters.
 *
 * Common scenarios:
 * - Single kubeconfig file with multiple cluster contexts
 * - Switching between contexts (minikube, kind, production, staging, etc.)
 * - Using environment variable content with context selection
 * - Shared kubeconfig across multiple clusters
 *
 * Prerequisites:
 * - @kubernetes/client-node installed: pnpm add @kubernetes/client-node
 * - A kubeconfig file with multiple contexts
 */

import { Database } from '../../src/database.class.js';
import { KubernetesInventoryPlugin } from '../../src/plugins/kubernetes-inventory.plugin.js';
import { readFileSync } from 'fs';
import { homedir } from 'os';

console.log('🔄 Kubernetes Inventory Plugin - Multi-Context Kubeconfig\n');
console.log('=' .repeat(80) + '\n');

// ============================================
// SCENARIO 1: Single File, Multiple Contexts
// ============================================
async function scenario1_singleFileMultipleContexts() {
  console.log('📋 SCENARIO 1: Single Kubeconfig File, Multiple Contexts\n');
  console.log('=' .repeat(80) + '\n');

  // Example kubeconfig structure:
  // ~/.kube/config contains:
  //   - minikube context
  //   - kind-dev context
  //   - production-cluster context
  //   - staging-cluster context

  const db = new Database({
    connectionString: 'memory://multi-context-1/databases/demo'
  });

  const plugin = new KubernetesInventoryPlugin({
    clusters: [
      // Cluster 1: Minikube (local development)
      {
        id: 'local-minikube',
        name: 'Minikube Local',
        kubeconfig: '~/.kube/config',
        context: 'minikube',  // 🎯 Select specific context
        tags: { env: 'local', tool: 'minikube' }
      },

      // Cluster 2: Kind (local testing)
      {
        id: 'local-kind',
        name: 'Kind Development',
        kubeconfig: '~/.kube/config',
        context: 'kind-dev',  // 🎯 Different context, same file
        tags: { env: 'local', tool: 'kind' }
      },

      // Cluster 3: Production
      {
        id: 'prod',
        name: 'Production Cluster',
        kubeconfig: '~/.kube/config',
        context: 'production-cluster',  // 🎯 Production context
        tags: { env: 'production', region: 'us-east' }
      },

      // Cluster 4: Staging
      {
        id: 'staging',
        name: 'Staging Cluster',
        kubeconfig: '~/.kube/config',
        context: 'staging-cluster',  // 🎯 Staging context
        tags: { env: 'staging', region: 'us-west' }
      }
    ],

    discovery: {
      runOnInstall: false,
      select: ['core.*', 'apps.*'],
      ignore: ['*.Event']
    },

    verbose: true
  });

  await db.usePlugin(plugin);
  await db.connect();

  console.log('✅ Plugin configured with 4 clusters, all using same kubeconfig file:\n');
  console.log('  File: ~/.kube/config');
  console.log('  Contexts:');
  console.log('    - minikube (local-minikube)');
  console.log('    - kind-dev (local-kind)');
  console.log('    - production-cluster (prod)');
  console.log('    - staging-cluster (staging)\n');

  console.log('💡 Each cluster uses a different context from the same file!\n');

  await db.disconnect();
  console.log('\n');
}

// ============================================
// SCENARIO 2: Environment Variable Content with Contexts
// ============================================
async function scenario2_envVarContentWithContexts() {
  console.log('📋 SCENARIO 2: Environment Variable Content + Multiple Contexts\n');
  console.log('=' .repeat(80) + '\n');

  // Simulate kubeconfig content in environment variable
  const kubeconfigContent = `
apiVersion: v1
kind: Config
clusters:
- cluster:
    certificate-authority-data: LS0tLS...
    server: https://prod.k8s.example.com:6443
  name: production
- cluster:
    certificate-authority-data: LS0tLS...
    server: https://staging.k8s.example.com:6443
  name: staging
- cluster:
    certificate-authority-data: LS0tLS...
    server: https://dev.k8s.example.com:6443
  name: development
contexts:
- context:
    cluster: production
    user: prod-user
  name: prod-context
- context:
    cluster: staging
    user: staging-user
  name: staging-context
- context:
    cluster: development
    user: dev-user
  name: dev-context
current-context: prod-context
users:
- name: prod-user
  user:
    token: eyJhbGci...
- name: staging-user
  user:
    token: eyJhbGci...
- name: dev-user
  user:
    token: eyJhbGci...
`;

  // Set environment variable (in real usage, this would be set externally)
  process.env.KUBECONFIG_CONTENT = kubeconfigContent;

  const db = new Database({
    connectionString: 'memory://multi-context-2/databases/demo'
  });

  const plugin = new KubernetesInventoryPlugin({
    clusters: [
      // Cluster 1: Production (uses KUBECONFIG_CONTENT env var)
      {
        id: 'prod',
        name: 'Production',
        // kubeconfigContent is auto-loaded from KUBECONFIG_CONTENT env var
        context: 'prod-context',  // 🎯 Select prod context
        tags: { env: 'production' }
      },

      // Cluster 2: Staging (same content, different context)
      {
        id: 'staging',
        name: 'Staging',
        context: 'staging-context',  // 🎯 Select staging context
        tags: { env: 'staging' }
      },

      // Cluster 3: Development (same content, different context)
      {
        id: 'dev',
        name: 'Development',
        context: 'dev-context',  // 🎯 Select dev context
        tags: { env: 'development' }
      }
    ],

    discovery: { runOnInstall: false },
    verbose: true
  });

  await db.usePlugin(plugin);
  await db.connect();

  console.log('✅ Plugin configured with 3 clusters from KUBECONFIG_CONTENT env var:\n');
  console.log('  Source: Environment variable (KUBECONFIG_CONTENT)');
  console.log('  Contexts:');
  console.log('    - prod-context → prod cluster');
  console.log('    - staging-context → staging cluster');
  console.log('    - dev-context → dev cluster\n');

  console.log('💡 Single kubeconfig content, multiple contexts selected!\n');

  // Cleanup
  delete process.env.KUBECONFIG_CONTENT;

  await db.disconnect();
  console.log('\n');
}

// ============================================
// SCENARIO 3: Direct Content with Context Selection
// ============================================
async function scenario3_directContentWithContexts() {
  console.log('📋 SCENARIO 3: Direct Content + Context Selection\n');
  console.log('=' .repeat(80) + '\n');

  const kubeconfigYaml = `
apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://aws-eks.example.com:6443
    certificate-authority-data: LS0t...
  name: aws-eks
- cluster:
    server: https://gcp-gke.example.com:6443
    certificate-authority-data: LS0t...
  name: gcp-gke
- cluster:
    server: https://azure-aks.example.com:6443
    certificate-authority-data: LS0t...
  name: azure-aks
contexts:
- context:
    cluster: aws-eks
    user: aws-user
  name: aws-context
- context:
    cluster: gcp-gke
    user: gcp-user
  name: gcp-context
- context:
    cluster: azure-aks
    user: azure-user
  name: azure-context
current-context: aws-context
users:
- name: aws-user
  user:
    token: eyJhbGci...
- name: gcp-user
  user:
    token: eyJhbGci...
- name: azure-user
  user:
    token: eyJhbGci...
`;

  const db = new Database({
    connectionString: 'memory://multi-context-3/databases/demo'
  });

  const plugin = new KubernetesInventoryPlugin({
    clusters: [
      // AWS EKS
      {
        id: 'aws-eks',
        name: 'AWS EKS Production',
        kubeconfigContent: kubeconfigYaml,  // 🎯 Same content for all
        context: 'aws-context',              // 🎯 AWS-specific context
        tags: { provider: 'aws', env: 'production' }
      },

      // GCP GKE
      {
        id: 'gcp-gke',
        name: 'GCP GKE Staging',
        kubeconfigContent: kubeconfigYaml,  // 🎯 Same content
        context: 'gcp-context',              // 🎯 GCP-specific context
        tags: { provider: 'gcp', env: 'staging' }
      },

      // Azure AKS
      {
        id: 'azure-aks',
        name: 'Azure AKS Development',
        kubeconfigContent: kubeconfigYaml,  // 🎯 Same content
        context: 'azure-context',            // 🎯 Azure-specific context
        tags: { provider: 'azure', env: 'development' }
      }
    ],

    discovery: { runOnInstall: false },
    verbose: true
  });

  await db.usePlugin(plugin);
  await db.connect();

  console.log('✅ Plugin configured with 3 cloud providers from single kubeconfig:\n');
  console.log('  Source: Direct kubeconfigContent');
  console.log('  Multi-cloud contexts:');
  console.log('    - aws-context → AWS EKS');
  console.log('    - gcp-context → GCP GKE');
  console.log('    - azure-context → Azure AKS\n');

  console.log('💡 Multi-cloud inventory from single kubeconfig!\n');

  await db.disconnect();
  console.log('\n');
}

// ============================================
// SCENARIO 4: Mixed Sources with Context Selection
// ============================================
async function scenario4_mixedSourcesWithContexts() {
  console.log('📋 SCENARIO 4: Mixed Sources (File + Env Var + Content)\n');
  console.log('=' .repeat(80) + '\n');

  const db = new Database({
    connectionString: 'memory://multi-context-4/databases/demo'
  });

  const plugin = new KubernetesInventoryPlugin({
    clusters: [
      // Local clusters: from file
      {
        id: 'minikube',
        name: 'Minikube',
        kubeconfig: '~/.kube/config',
        context: 'minikube',
        tags: { env: 'local', type: 'file' }
      },

      // Production: from environment variable
      {
        id: 'prod',
        name: 'Production',
        // Uses KUBECONFIG_CONTENT_PROD env var
        context: 'prod-context',
        tags: { env: 'production', type: 'env-var' }
      },

      // Staging: from direct content
      {
        id: 'staging',
        name: 'Staging',
        kubeconfigContent: '... staging kubeconfig yaml ...',
        context: 'staging-context',
        tags: { env: 'staging', type: 'direct-content' }
      },

      // Customer cluster: from customer-specific env var
      {
        id: 'customer-a',
        name: 'Customer A Cluster',
        // Uses KUBECONFIG_CUSTOMER_A env var
        context: 'customer-a-context',
        tags: { customer: 'customer-a', type: 'env-var' }
      }
    ],

    discovery: { runOnInstall: false },
    verbose: true
  });

  await db.usePlugin(plugin);
  await db.connect();

  console.log('✅ Plugin configured with 4 clusters from mixed sources:\n');
  console.log('  Cluster Sources:');
  console.log('    1. minikube → File (~/.kube/config) + context');
  console.log('    2. prod → Env var (KUBECONFIG_CONTENT_PROD) + context');
  console.log('    3. staging → Direct content + context');
  console.log('    4. customer-a → Env var (KUBECONFIG_CUSTOMER_A) + context\n');

  console.log('💡 Ultimate flexibility: mix and match sources + contexts!\n');

  await db.disconnect();
  console.log('\n');
}

// ============================================
// SCENARIO 5: Real-World CI/CD Pattern
// ============================================
async function scenario5_realWorldCICD() {
  console.log('📋 SCENARIO 5: Real-World CI/CD Pattern\n');
  console.log('=' .repeat(80) + '\n');

  // Simulate CI/CD environment variables
  console.log('🔧 CI/CD Environment Setup:\n');
  console.log('```bash');
  console.log('# Single kubeconfig with all environments');
  console.log('export KUBECONFIG_CONTENT=$(cat all-environments.yaml | base64)');
  console.log('');
  console.log('# Or per-environment configs');
  console.log('export KUBECONFIG_CONTENT_PROD=$(cat prod-kubeconfig.yaml | base64)');
  console.log('export KUBECONFIG_CONTENT_STAGING=$(cat staging-kubeconfig.yaml | base64)');
  console.log('export KUBECONFIG_CONTENT_DEV=$(cat dev-kubeconfig.yaml | base64)');
  console.log('```\n');

  const db = new Database({
    connectionString: 'memory://multi-context-5/databases/demo'
  });

  const plugin = new KubernetesInventoryPlugin({
    clusters: [
      // Option A: Single kubeconfig, multiple contexts
      {
        id: 'prod-us-east',
        name: 'Production US East',
        // Auto-loads from KUBECONFIG_CONTENT
        context: 'prod-us-east-context',
        discovery: {
          namespaces: null, // All namespaces
          includeCRDs: true
        },
        scheduled: {
          enabled: true,
          cron: '0 */6 * * *', // Every 6 hours
          runOnStart: false
        },
        tags: { env: 'production', region: 'us-east' }
      },

      {
        id: 'prod-eu-west',
        name: 'Production EU West',
        context: 'prod-eu-west-context',
        discovery: {
          namespaces: null,
          includeCRDs: true
        },
        scheduled: {
          enabled: true,
          cron: '0 */6 * * *',
          runOnStart: false
        },
        tags: { env: 'production', region: 'eu-west' }
      },

      // Option B: Per-environment kubeconfigs
      {
        id: 'staging',
        name: 'Staging',
        // Auto-loads from KUBECONFIG_CONTENT_STAGING
        context: 'staging-context',
        discovery: {
          namespaces: ['default', 'staging'],
          includeCRDs: true
        },
        scheduled: {
          enabled: true,
          cron: '0 */12 * * *', // Every 12 hours
          runOnStart: true
        },
        tags: { env: 'staging' }
      },

      {
        id: 'dev',
        name: 'Development',
        // Auto-loads from KUBECONFIG_CONTENT_DEV
        context: 'dev-context',
        discovery: {
          namespaces: ['default', 'development'],
          includeCRDs: false
        },
        scheduled: {
          enabled: true,
          cron: '0 * * * *', // Hourly
          runOnStart: true
        },
        tags: { env: 'development' }
      }
    ],

    discovery: {
      runOnInstall: true,
      select: ['core.*', 'apps.*', 'batch.*'],
      ignore: ['*.Event', '*.Lease']
    },

    verbose: false
  });

  await db.usePlugin(plugin);
  await db.connect();

  console.log('✅ Production-ready configuration:\n');
  console.log('  Clusters:');
  console.log('    - prod-us-east (every 6h, all namespaces)');
  console.log('    - prod-eu-west (every 6h, all namespaces)');
  console.log('    - staging (every 12h, selected namespaces)');
  console.log('    - dev (hourly, selected namespaces)\n');

  console.log('  Context Selection:');
  console.log('    - Each cluster uses specific context from kubeconfig');
  console.log('    - Supports both single and multiple kubeconfig sources\n');

  console.log('  Scheduling:');
  console.log('    - Automated discovery per cluster');
  console.log('    - Different frequencies per environment\n');

  console.log('💡 Perfect for multi-region, multi-environment deployments!\n');

  await db.disconnect();
  console.log('\n');
}

// ============================================
// MAIN EXECUTION
// ============================================
async function main() {
  await scenario1_singleFileMultipleContexts();
  await scenario2_envVarContentWithContexts();
  await scenario3_directContentWithContexts();
  await scenario4_mixedSourcesWithContexts();
  await scenario5_realWorldCICD();

  console.log('=' .repeat(80));
  console.log('\n📝 Key Patterns Summary:\n');
  console.log('=' .repeat(80) + '\n');

  console.log('1️⃣  Single File, Multiple Contexts');
  console.log('   kubeconfig: "~/.kube/config"');
  console.log('   context: "minikube" | "production" | "staging"\n');

  console.log('2️⃣  Environment Variable + Context');
  console.log('   Auto-loads from: KUBECONFIG_CONTENT');
  console.log('   context: "prod-context" | "staging-context"\n');

  console.log('3️⃣  Direct Content + Context');
  console.log('   kubeconfigContent: "..." (YAML string)');
  console.log('   context: "aws-context" | "gcp-context"\n');

  console.log('4️⃣  Cluster-Specific Env Var + Context');
  console.log('   Auto-loads from: KUBECONFIG_CONTENT_<CLUSTER_ID>');
  console.log('   context: "specific-context"\n');

  console.log('5️⃣  Mixed Sources (Ultimate Flexibility)');
  console.log('   - Some clusters from file + context');
  console.log('   - Some from env var + context');
  console.log('   - Some from direct content + context\n');

  console.log('=' .repeat(80));
  console.log('\n💡 Context Selection Benefits:\n');
  console.log('=' .repeat(80) + '\n');

  console.log('✅ Single kubeconfig for multiple clusters');
  console.log('✅ No need to split kubeconfig files');
  console.log('✅ Works with kubectl, k9s, and other tools');
  console.log('✅ Standard Kubernetes approach');
  console.log('✅ Easy to manage in CI/CD');
  console.log('✅ Supports context switching dynamically\n');

  console.log('=' .repeat(80));
  console.log('\n🎯 Recommended Patterns:\n');
  console.log('=' .repeat(80) + '\n');

  console.log('Local Development:');
  console.log('  kubeconfig: "~/.kube/config"');
  console.log('  context: "minikube" or "kind-kind"\n');

  console.log('CI/CD (Single Config):');
  console.log('  KUBECONFIG_CONTENT=(base64 kubeconfig with all contexts)');
  console.log('  context: "prod-context" or "staging-context"\n');

  console.log('CI/CD (Per-Environment):');
  console.log('  KUBECONFIG_CONTENT_PROD=(base64 prod kubeconfig)');
  console.log('  KUBECONFIG_CONTENT_STAGING=(base64 staging kubeconfig)');
  console.log('  context: select appropriate context in each\n');

  console.log('Multi-Cloud:');
  console.log('  Single kubeconfig with contexts for AWS, GCP, Azure');
  console.log('  context: "aws-eks" or "gcp-gke" or "azure-aks"\n');

  console.log('✅ All multi-context scenarios completed!\n');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
