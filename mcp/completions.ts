/**
 * MCP Completions for s3db.js
 *
 * Smart auto-complete suggestions for:
 * - Prompt arguments (behaviors, plugins, auth types, field types)
 * - Resource URIs (plugin names, guide topics, example categories)
 * - Tool parameters (resource names, filter operators)
 */

import type { MCPCompletionRequest, MCPCompletionResult } from './types/index.js';
import { plugins, fieldTypes, behaviors, clients, guides, exampleCategories } from './docs-data.js';
import { prompts } from './prompts.js';
import { resourceTemplates } from './resources.js';

// =============================================================================
// Completion Values
// =============================================================================

const completionValues = {
  // Plugin names (lowercase, without 'Plugin' suffix)
  plugins: plugins.map((p) => p.name.replace('Plugin', '').toLowerCase()),

  // Plugin names with descriptions for richer completions
  pluginsWithDesc: plugins.map((p) => ({
    value: p.name.replace('Plugin', '').toLowerCase(),
    description: p.description.slice(0, 60) + '...',
  })),

  // Field types
  fieldTypes: fieldTypes.map((ft) => ft.name),

  // Behaviors
  behaviors: behaviors.map((b) => b.name),

  // Behavior names with descriptions
  behaviorsWithDesc: behaviors.map((b) => ({
    value: b.name,
    description: b.useCase,
  })),

  // Clients
  clients: clients.map((c) => c.name.replace('Client', '').toLowerCase()),

  // Guide topics
  guides: guides.map((g) => g.topic),

  // Example categories
  examples: Object.keys(exampleCategories),

  // Auth types for API plugin
  authTypes: ['apikey', 'bearer', 'basic', 'oauth2', 'oidc', 'none'],

  // Replication targets
  replicationTargets: ['postgresql', 'bigquery', 'sqs', 'webhook', 'redis'],

  // Embedding providers
  embeddingProviders: ['openai', 'cohere', 'local', 'huggingface'],

  // Embedding dimensions
  embeddingDimensions: ['384', '512', '768', '1024', '1536', '3072'],

  // Data volumes
  dataVolumes: ['small', 'medium', 'large', 'huge'],

  // Environments
  environments: ['production', 'development', 'testing', 'ci'],

  // Query operators
  queryOperators: ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$exists', '$regex'],

  // Replication modes
  replicationModes: ['realtime', 'batch'],

  // Common validators
  validators: [
    'required',
    'optional',
    'email',
    'url',
    'uuid',
    'min:',
    'max:',
    'length:',
    'pattern:',
    'enum:',
    'positive',
    'negative',
    'integer',
  ],

  // API features
  apiFeatures: ['rate-limit', 'audit', 'cache', 'cors', 'compression', 'logging'],

  // Partition granularities
  partitionGranularities: ['hour', 'day', 'week', 'month', 'year'],

  // Cache drivers
  cacheDrivers: ['memory', 'filesystem', 's3', 'redis'],

  // Storage classes
  storageClasses: ['STANDARD', 'STANDARD_IA', 'ONEZONE_IA', 'GLACIER', 'DEEP_ARCHIVE'],

  // Core documentation topics
  coreTopics: [
    'database',
    'schema',
    'behaviors',
    'partitions',
    'queries',
    'streaming',
    'encryption',
    'hooks',
    'guards',
    'middleware',
  ],

  // Reference topics
  referenceTopics: ['cli', 'mcp', 'errors', 'api', 'changelog', 'migration'],
};

// =============================================================================
// Completion Handler
// =============================================================================

export function complete(request: MCPCompletionRequest): MCPCompletionResult {
  const { ref, argument } = request;

  // Handle prompt argument completions
  if (ref.type === 'ref/prompt' && ref.name) {
    return completePromptArgument(ref.name, argument.name, argument.value);
  }

  // Handle resource URI completions
  if (ref.type === 'ref/resource' && ref.uri) {
    return completeResourceUri(ref.uri, argument.value);
  }

  return { values: [], total: 0, hasMore: false };
}

// =============================================================================
// Prompt Argument Completions
// =============================================================================

function completePromptArgument(
  promptName: string,
  argName: string,
  currentValue: string
): MCPCompletionResult {
  let candidates: string[] = [];

  switch (promptName) {
    case 'create_resource':
      candidates = completeCreateResourceArg(argName);
      break;

    case 'setup_plugin':
      candidates = completeSetupPluginArg(argName);
      break;

    case 'create_partition_strategy':
      candidates = completePartitionStrategyArg(argName);
      break;

    case 'create_api_server':
      candidates = completeApiServerArg(argName);
      break;

    case 'explain_behavior':
      candidates = completeBehaviorArg(argName);
      break;

    case 'explain_plugin':
      candidates = completeExplainPluginArg(argName);
      break;

    case 'compare_clients':
      candidates = completeCompareClientsArg(argName);
      break;

    case 'setup_vector_rag':
      candidates = completeVectorRagArg(argName);
      break;

    case 'setup_replication':
      candidates = completeReplicationArg(argName);
      break;

    default:
      // Generic completions based on argument name
      candidates = completeGenericArg(argName);
  }

  return filterAndLimit(candidates, currentValue);
}

function completeCreateResourceArg(argName: string): string[] {
  switch (argName) {
    case 'behavior':
      return completionValues.behaviors;
    case 'timestamps':
      return ['true', 'false'];
    case 'fields':
      // Suggest common field patterns
      return [
        'name:string|required',
        'email:string|email|required',
        'age:number|min:0',
        'status:string|enum:active,inactive',
        'password:secret',
        'createdAt:date',
        'metadata:object',
        'tags:array',
      ];
    default:
      return [];
  }
}

function completeSetupPluginArg(argName: string): string[] {
  switch (argName) {
    case 'plugin':
      return completionValues.plugins;
    case 'useCase':
      return [
        'high-read workload',
        'write-heavy application',
        'multi-tenant SaaS',
        'time-series data',
        'e-commerce catalog',
        'user management',
        'audit logging',
        'real-time sync',
      ];
    default:
      return [];
  }
}

function completePartitionStrategyArg(argName: string): string[] {
  switch (argName) {
    case 'dataVolume':
      return completionValues.dataVolumes;
    case 'queryPatterns':
      return [
        'by user',
        'by date range',
        'by status',
        'by tenant',
        'by category',
        'by region',
        'by type and status',
      ];
    default:
      return [];
  }
}

function completeApiServerArg(argName: string): string[] {
  switch (argName) {
    case 'authType':
      return completionValues.authTypes;
    case 'features':
      return completionValues.apiFeatures;
    case 'resources':
      return ['users', 'orders', 'products', 'customers', 'logs', 'events'];
    default:
      return [];
  }
}

function completeBehaviorArg(argName: string): string[] {
  switch (argName) {
    case 'behavior':
      return completionValues.behaviors;
    case 'scenario':
      return [
        'storing user profiles',
        'large JSON documents',
        'audit logs',
        'session data',
        'product catalog',
        'configuration objects',
      ];
    default:
      return [];
  }
}

function completeExplainPluginArg(argName: string): string[] {
  switch (argName) {
    case 'plugin':
      return completionValues.plugins;
    default:
      return [];
  }
}

function completeCompareClientsArg(argName: string): string[] {
  switch (argName) {
    case 'environment':
      return completionValues.environments;
    default:
      return [];
  }
}

function completeVectorRagArg(argName: string): string[] {
  switch (argName) {
    case 'embeddingProvider':
      return completionValues.embeddingProviders;
    case 'dimensions':
      return completionValues.embeddingDimensions;
    case 'useCase':
      return ['semantic-search', 'qa', 'recommendations', 'clustering', 'classification'];
    default:
      return [];
  }
}

function completeReplicationArg(argName: string): string[] {
  switch (argName) {
    case 'target':
      return completionValues.replicationTargets;
    case 'mode':
      return completionValues.replicationModes;
    case 'resources':
      return ['all', 'users', 'orders', 'products', 'events', 'logs'];
    default:
      return [];
  }
}

function completeGenericArg(argName: string): string[] {
  // Generic completions based on common argument names
  const genericMappings: Record<string, string[]> = {
    plugin: completionValues.plugins,
    behavior: completionValues.behaviors,
    fieldType: completionValues.fieldTypes,
    client: completionValues.clients,
    authType: completionValues.authTypes,
    environment: completionValues.environments,
    driver: completionValues.cacheDrivers,
    granularity: completionValues.partitionGranularities,
    storageClass: completionValues.storageClasses,
  };

  return genericMappings[argName] || [];
}

// =============================================================================
// Resource URI Completions
// =============================================================================

function completeResourceUri(uriTemplate: string, currentValue: string): MCPCompletionResult {
  // Parse the URI template to determine what to complete
  const templateMatch = resourceTemplates.find((t) => uriTemplate.includes(t.uriTemplate.split('{')[0]));

  if (!templateMatch) {
    return { values: [], total: 0, hasMore: false };
  }

  let candidates: string[] = [];

  // Determine candidates based on template
  if (templateMatch.uriTemplate.includes('{name}')) {
    if (templateMatch.uriTemplate.includes('plugin')) {
      candidates = completionValues.plugins;
    } else if (templateMatch.uriTemplate.includes('client')) {
      candidates = completionValues.clients;
    } else if (templateMatch.uriTemplate.includes('behavior')) {
      candidates = completionValues.behaviors;
    }
  } else if (templateMatch.uriTemplate.includes('{topic}')) {
    if (templateMatch.uriTemplate.includes('core')) {
      candidates = completionValues.coreTopics;
    } else if (templateMatch.uriTemplate.includes('guide')) {
      candidates = completionValues.guides;
    } else if (templateMatch.uriTemplate.includes('reference')) {
      candidates = completionValues.referenceTopics;
    }
  } else if (templateMatch.uriTemplate.includes('{type}')) {
    candidates = completionValues.fieldTypes;
  } else if (templateMatch.uriTemplate.includes('{category}')) {
    candidates = completionValues.examples;
  }

  return filterAndLimit(candidates, currentValue);
}

// =============================================================================
// Utilities
// =============================================================================

function filterAndLimit(
  candidates: string[],
  prefix: string,
  limit: number = 20
): MCPCompletionResult {
  const normalizedPrefix = prefix.toLowerCase();

  const filtered = candidates
    .filter((c) => c.toLowerCase().startsWith(normalizedPrefix))
    .slice(0, limit);

  return {
    values: filtered,
    total: filtered.length,
    hasMore: candidates.length > limit,
  };
}

// =============================================================================
// Exported Completion Values (for external use)
// =============================================================================

export { completionValues };

// =============================================================================
// Tool Argument Completions (for tools/*)
// =============================================================================

export function completeToolArgument(
  toolName: string,
  argName: string,
  currentValue: string
): MCPCompletionResult {
  let candidates: string[] = [];

  switch (toolName) {
    case 'resource_query':
    case 'resource_list':
    case 'resource_get':
    case 'resource_insert':
    case 'resource_update':
    case 'resource_delete':
      if (argName === 'resourceName') {
        // This would need runtime access to actual resource names
        candidates = ['users', 'orders', 'products', 'logs', 'events', 'sessions'];
      }
      break;

    case 'db_create_resource':
      if (argName === 'behavior') {
        candidates = completionValues.behaviors;
      }
      break;

    case 'cache_get_stats':
    case 'resource_get_stats':
      if (argName === 'resourceName') {
        candidates = ['users', 'orders', 'products', 'logs', 'events', 'sessions'];
      }
      break;

    default:
      // Use generic mappings
      candidates = completeGenericArg(argName);
  }

  return filterAndLimit(candidates, currentValue);
}

// =============================================================================
// Prompt List for Completions
// =============================================================================

export function getPromptNames(): string[] {
  return prompts.map((p) => p.name);
}

export function getPromptArguments(promptName: string): string[] {
  const prompt = prompts.find((p) => p.name === promptName);
  if (!prompt || !prompt.arguments) return [];
  return prompt.arguments.map((a) => a.name);
}
