export const prompts = [
  {
    name: 'describe-schema',
    description: 'Generate a schema design recommendation for a given use case. Analyzes requirements and suggests field types, behaviors, and partitioning strategies.',
    arguments: [
      {
        name: 'useCase',
        description: 'Description of the use case (e.g., "e-commerce product catalog", "user sessions", "IoT sensor data")',
        required: true
      },
      {
        name: 'expectedRecordCount',
        description: 'Expected number of records (e.g., "1000", "1M", "100M")',
        required: false
      },
      {
        name: 'queryPatterns',
        description: 'Common query patterns (e.g., "by user_id", "by date range", "full-text search")',
        required: false
      }
    ]
  },
  {
    name: 'optimize-partition',
    description: 'Recommend an optimal partitioning strategy based on query patterns. Analyzes access patterns and suggests partition fields.',
    arguments: [
      {
        name: 'queryPattern',
        description: 'Primary query pattern (e.g., "filter by tenant_id and date", "lookup by user_id")',
        required: true
      },
      {
        name: 'schema',
        description: 'Current schema definition (JSON format)',
        required: false
      },
      {
        name: 'recordsPerPartition',
        description: 'Target records per partition (default: 1000)',
        required: false
      }
    ]
  },
  {
    name: 'compare-costs',
    description: 'Compare S3DB costs vs traditional databases for a given scenario. Provides detailed cost breakdown.',
    arguments: [
      {
        name: 'scenario',
        description: 'Usage scenario description',
        required: true
      },
      {
        name: 'recordCount',
        description: 'Number of records',
        required: true
      },
      {
        name: 'avgRecordSizeKb',
        description: 'Average record size in KB',
        required: true
      },
      {
        name: 'readsPerMonth',
        description: 'Expected read operations per month',
        required: true
      },
      {
        name: 'writesPerMonth',
        description: 'Expected write operations per month',
        required: true
      }
    ]
  },
  {
    name: 'design-multitenancy',
    description: 'Recommend a multi-tenancy pattern for S3DB based on requirements. Covers isolation, performance, and cost trade-offs.',
    arguments: [
      {
        name: 'requirements',
        description: 'Multi-tenancy requirements description',
        required: true
      },
      {
        name: 'tenantCount',
        description: 'Expected number of tenants',
        required: false
      },
      {
        name: 'isolationLevel',
        description: 'Required isolation level (shared, logical, physical)',
        required: false
      }
    ]
  },
  {
    name: 'debug-metadata-limit',
    description: 'Analyze a schema and sample data to identify 2KB metadata limit issues. Suggests behaviors and optimizations.',
    arguments: [
      {
        name: 'schema',
        description: 'Resource schema definition (JSON format)',
        required: true
      },
      {
        name: 'sampleData',
        description: 'Sample record data that exceeds limits (JSON format)',
        required: false
      }
    ]
  },
  {
    name: 'migration-guide',
    description: 'Generate a step-by-step migration guide from a source database to S3DB.',
    arguments: [
      {
        name: 'source',
        description: 'Source database type (mongodb, postgresql, mysql, dynamodb, firestore)',
        required: true
      },
      {
        name: 'schema',
        description: 'Source schema or table structure (JSON format)',
        required: false
      },
      {
        name: 'dataVolume',
        description: 'Approximate data volume (e.g., "10GB", "500k records")',
        required: false
      }
    ]
  }
];

export function getPromptContent(name: string, args: Record<string, string>): { role: string; content: string }[] {
  switch (name) {
    case 'describe-schema':
      return [
        {
          role: 'user',
          content: `You are an S3DB schema design expert. Analyze the following use case and generate a recommended schema.

Use Case: ${args.useCase}
Expected Records: ${args.expectedRecordCount || 'Not specified'}
Query Patterns: ${args.queryPatterns || 'Not specified'}

Please provide:
1. A complete schema definition with appropriate field types
2. Recommended behavior strategy (body-overflow, body-only, enforce-limits, etc.)
3. Partitioning strategy if applicable
4. Any plugins that would be beneficial (cache, ttl, audit, etc.)
5. Performance considerations

Format the schema as valid JavaScript/TypeScript code that can be used with S3DB.`
        }
      ];

    case 'optimize-partition':
      return [
        {
          role: 'user',
          content: `You are an S3DB partitioning expert. Analyze the query pattern and recommend an optimal partitioning strategy.

Query Pattern: ${args.queryPattern}
Current Schema: ${args.schema || 'Not provided'}
Target Records per Partition: ${args.recordsPerPartition || '1000'}

Please provide:
1. Recommended partition fields
2. Partition configuration code
3. Expected performance improvement (O(n) vs O(1) lookups)
4. Trade-offs and considerations
5. Example queries that will benefit from this partitioning`
        }
      ];

    case 'compare-costs':
      return [
        {
          role: 'user',
          content: `You are a cloud cost analyst. Compare the costs of using S3DB vs traditional databases.

Scenario: ${args.scenario}
Records: ${args.recordCount}
Average Record Size: ${args.avgRecordSizeKb} KB
Monthly Reads: ${args.readsPerMonth}
Monthly Writes: ${args.writesPerMonth}

Please provide:
1. S3DB cost breakdown (storage, API calls, data transfer)
2. Comparison with:
   - Amazon DynamoDB
   - Amazon RDS PostgreSQL
   - MongoDB Atlas
3. Break-even analysis
4. Recommendations based on the use case
5. Hidden costs to consider (development time, operational overhead)`
        }
      ];

    case 'design-multitenancy':
      return [
        {
          role: 'user',
          content: `You are an S3DB multi-tenancy architect. Design a multi-tenancy strategy.

Requirements: ${args.requirements}
Expected Tenants: ${args.tenantCount || 'Not specified'}
Isolation Level: ${args.isolationLevel || 'Not specified'}

Please provide:
1. Recommended multi-tenancy pattern:
   - Shared bucket with prefixes
   - Separate buckets per tenant
   - Hybrid approach
2. Implementation code examples
3. Security considerations
4. Performance implications
5. Cost implications
6. Scaling considerations`
        }
      ];

    case 'debug-metadata-limit':
      return [
        {
          role: 'user',
          content: `You are an S3DB troubleshooting expert. Analyze the schema and data for 2KB metadata limit issues.

Schema: ${args.schema}
Sample Data: ${args.sampleData || 'Not provided'}

Please analyze:
1. Estimated metadata size for each field
2. Fields contributing most to metadata size
3. Recommended behavior strategy
4. Optimization suggestions:
   - Fields to move to body
   - Compression opportunities
   - Field type changes
5. Code changes needed`
        }
      ];

    case 'migration-guide':
      return [
        {
          role: 'user',
          content: `You are a database migration expert. Create a migration guide from ${args.source} to S3DB.

Source Database: ${args.source}
Source Schema: ${args.schema || 'Not provided'}
Data Volume: ${args.dataVolume || 'Not specified'}

Please provide:
1. Schema mapping (source → S3DB)
2. Data type conversions
3. Step-by-step migration process
4. Code examples for data export/import
5. Validation strategy
6. Rollback plan
7. Performance considerations during migration
8. Post-migration verification steps`
        }
      ];

    default:
      return [
        {
          role: 'user',
          content: `Unknown prompt: ${name}`
        }
      ];
  }
}
