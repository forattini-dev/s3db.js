/**
 * Example: Resource Schema Introspection
 *
 * Demonstrates the new resource.$schema property for accessing
 * the original resource definition (raw schema).
 *
 * Use cases:
 * - Plugin development (introspect resource structure)
 * - Documentation generation
 * - Schema validation
 * - Migration tools
 * - API generation
 */

import { Database } from '../../src/database.class.js';

async function main() {
  const db = new Database({
    connectionString: 'http://test:test@localhost:4566/bucket',
    paranoid: false
  });

  await db.connect();

  console.log('\n📋 Resource Schema Introspection Demo\n');

  // =================================================================
  // 1. BASIC SCHEMA ACCESS
  // =================================================================
  console.log('1️⃣  Basic Schema Access\n');
  console.log('━'.repeat(60));

  const users = await db.createResource({
    name: 'users_introspection',
    attributes: {
      name: 'string|required',
      email: 'string|required|email',
      age: 'number|min:0|max:150',
      role: 'string|enum:admin,user,guest',
      profile: {
        bio: 'string|max:500',
        avatar: 'url',
        social: {
          twitter: 'string',
          github: 'string'
        }
      }
    },
    behavior: 'body-overflow',
    timestamps: true,
    partitions: {
      byRole: { fields: { role: 'string' } },
      byAge: { fields: { age: 'number' } }
    },
    guard: {
      insert: async (data) => data.role !== 'admin', // Only non-admins can self-register
      delete: async (id) => false // Prevent deletion
    }
  });

  console.log('\n📊 Resource Definition:\n');
  console.log('Name:', users.$schema.name);
  console.log('Version:', users.$schema.version);
  console.log('Behavior:', users.$schema.behavior);
  console.log('Timestamps:', users.$schema.timestamps);
  console.log('Paranoid:', users.$schema.paranoid);
  console.log('ID Generator:', users.$schema.idGenerator);
  console.log('ID Size:', users.$schema.idSize);

  console.log('\n📝 Attributes:\n');
  Object.entries(users.$schema.attributes).forEach(([key, definition]) => {
    console.log(`   ${key}: ${typeof definition === 'object' ? JSON.stringify(definition) : definition}`);
  });

  console.log('\n🔀 Partitions:\n');
  Object.entries(users.$schema.partitions).forEach(([name, config]) => {
    console.log(`   ${name}:`, JSON.stringify(config.fields));
  });

  console.log('\n🛡️  Guard Functions:\n');
  console.log('   insert:', users.$schema.guard?.insert ? '✅ Defined' : '❌ Not defined');
  console.log('   update:', users.$schema.guard?.update ? '✅ Defined' : '❌ Not defined');
  console.log('   delete:', users.$schema.guard?.delete ? '✅ Defined' : '❌ Not defined');

  console.log('\n⏰ Metadata:\n');
  console.log('   Created At:', new Date(users.$schema._createdAt).toISOString());
  console.log('   Updated At:', new Date(users.$schema._updatedAt).toISOString());

  // =================================================================
  // 2. PLUGIN USE CASE: INTROSPECTION
  // =================================================================
  console.log('\n\n2️⃣  Plugin Use Case: Schema Introspection\n');
  console.log('━'.repeat(60));

  // Simulate a plugin that needs to inspect the resource schema
  function analyzeResource(resource) {
    const analysis = {
      name: resource.$schema.name,
      totalAttributes: Object.keys(resource.$schema.attributes).length,
      requiredFields: [],
      optionalFields: [],
      partitionedFields: Object.keys(resource.$schema.partitions || {}),
      hasGuards: !!resource.$schema.guard,
      hasTimestamps: resource.$schema.timestamps
    };

    // Analyze attributes
    for (const [name, def] of Object.entries(resource.$schema.attributes)) {
      const isRequired = typeof def === 'string' && def.includes('required');
      if (isRequired) {
        analysis.requiredFields.push(name);
      } else {
        analysis.optionalFields.push(name);
      }
    }

    return analysis;
  }

  const analysis = analyzeResource(users);

  console.log('\n📊 Resource Analysis:\n');
  console.log('   Resource:', analysis.name);
  console.log('   Total Attributes:', analysis.totalAttributes);
  console.log('   Required Fields:', analysis.requiredFields.join(', '));
  console.log('   Optional Fields:', analysis.optionalFields.join(', '));
  console.log('   Partitioned By:', analysis.partitionedFields.join(', '));
  console.log('   Has Guards:', analysis.hasGuards ? 'Yes' : 'No');
  console.log('   Has Timestamps:', analysis.hasTimestamps ? 'Yes' : 'No');

  // =================================================================
  // 3. DOCUMENTATION GENERATION
  // =================================================================
  console.log('\n\n3️⃣  Documentation Generation\n');
  console.log('━'.repeat(60));

  function generateMarkdownDocs(resource) {
    const schema = resource.$schema;
    let markdown = `# ${schema.name}\n\n`;

    // Overview
    markdown += `## Overview\n\n`;
    markdown += `- **Version**: ${schema.version}\n`;
    markdown += `- **Behavior**: ${schema.behavior}\n`;
    markdown += `- **Timestamps**: ${schema.timestamps ? 'Enabled' : 'Disabled'}\n`;
    markdown += `- **ID Size**: ${schema.idSize} characters\n\n`;

    // Attributes
    markdown += `## Attributes\n\n`;
    markdown += `| Field | Type | Validation |\n`;
    markdown += `|-------|------|------------|\n`;

    for (const [name, def] of Object.entries(schema.attributes)) {
      const defStr = typeof def === 'object' ? JSON.stringify(def) : def;
      const parts = defStr.split('|');
      const type = parts[0] || 'unknown';
      const validation = parts.slice(1).join(', ') || '-';
      markdown += `| ${name} | ${type} | ${validation} |\n`;
    }

    // Partitions
    if (Object.keys(schema.partitions).length > 0) {
      markdown += `\n## Partitions\n\n`;
      for (const [name, config] of Object.entries(schema.partitions)) {
        markdown += `- **${name}**: ${JSON.stringify(config.fields)}\n`;
      }
    }

    // Guards
    if (schema.guard) {
      markdown += `\n## Security\n\n`;
      markdown += `Guards are configured for:\n`;
      for (const op of Object.keys(schema.guard)) {
        markdown += `- ${op}\n`;
      }
    }

    return markdown;
  }

  const docs = generateMarkdownDocs(users);
  console.log('\n📄 Generated Documentation:\n');
  console.log(docs);

  // =================================================================
  // 4. SCHEMA COMPARISON
  // =================================================================
  console.log('\n4️⃣  Schema Comparison (Migration Detection)\n');
  console.log('━'.repeat(60));

  // Create another version of users
  const usersV2 = await db.createResource({
    name: 'users_v2',
    attributes: {
      name: 'string|required',
      email: 'string|required|email',
      age: 'number|min:0|max:150',
      role: 'string|enum:admin,user,guest,moderator', // Added moderator
      status: 'string|enum:active,inactive',           // NEW FIELD
      profile: {
        bio: 'string|max:500',
        avatar: 'url',
        social: {
          twitter: 'string',
          github: 'string',
          linkedin: 'string'  // NEW FIELD
        }
      }
    },
    timestamps: true,
    partitions: {
      byRole: { fields: { role: 'string' } },
      byStatus: { fields: { status: 'string' } }  // NEW PARTITION
    }
  });

  function compareSchemas(schema1, schema2) {
    const changes = {
      addedFields: [],
      removedFields: [],
      modifiedFields: [],
      addedPartitions: [],
      removedPartitions: []
    };

    const attrs1 = Object.keys(schema1.attributes);
    const attrs2 = Object.keys(schema2.attributes);

    // Check for added/removed fields
    changes.addedFields = attrs2.filter(a => !attrs1.includes(a));
    changes.removedFields = attrs1.filter(a => !attrs2.includes(a));

    // Check for modified fields (simple string comparison)
    for (const attr of attrs1.filter(a => attrs2.includes(a))) {
      const def1 = JSON.stringify(schema1.attributes[attr]);
      const def2 = JSON.stringify(schema2.attributes[attr]);
      if (def1 !== def2) {
        changes.modifiedFields.push(attr);
      }
    }

    // Check partitions
    const parts1 = Object.keys(schema1.partitions || {});
    const parts2 = Object.keys(schema2.partitions || {});
    changes.addedPartitions = parts2.filter(p => !parts1.includes(p));
    changes.removedPartitions = parts1.filter(p => !parts2.includes(p));

    return changes;
  }

  const changes = compareSchemas(users.$schema, usersV2.$schema);

  console.log('\n🔄 Schema Changes Detected:\n');

  if (changes.addedFields.length > 0) {
    console.log('   ✅ Added Fields:', changes.addedFields.join(', '));
  }

  if (changes.removedFields.length > 0) {
    console.log('   ❌ Removed Fields:', changes.removedFields.join(', '));
  }

  if (changes.modifiedFields.length > 0) {
    console.log('   ⚠️  Modified Fields:', changes.modifiedFields.join(', '));
  }

  if (changes.addedPartitions.length > 0) {
    console.log('   ➕ Added Partitions:', changes.addedPartitions.join(', '));
  }

  if (changes.removedPartitions.length > 0) {
    console.log('   ➖ Removed Partitions:', changes.removedPartitions.join(', '));
  }

  // =================================================================
  // 5. API GENERATION USE CASE
  // =================================================================
  console.log('\n\n5️⃣  API Generation (OpenAPI Schema)\n');
  console.log('━'.repeat(60));

  function generateOpenAPISchema(resource) {
    const schema = resource.$schema;

    const openapi = {
      openapi: '3.0.0',
      info: {
        title: `${schema.name} API`,
        version: schema.version
      },
      paths: {
        [`/${schema.name}`]: {
          get: {
            summary: `List ${schema.name}`,
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: { $ref: `#/components/schemas/${schema.name}` }
                    }
                  }
                }
              }
            }
          },
          post: {
            summary: `Create ${schema.name}`,
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: `#/components/schemas/${schema.name}` }
                }
              }
            },
            responses: {
              '201': { description: 'Created' }
            }
          }
        }
      },
      components: {
        schemas: {
          [schema.name]: {
            type: 'object',
            required: [],
            properties: {}
          }
        }
      }
    };

    // Convert attributes to OpenAPI properties
    for (const [name, def] of Object.entries(schema.attributes)) {
      const defStr = typeof def === 'object' ? 'object' : def;
      const parts = defStr.split('|');
      const type = parts[0];
      const isRequired = parts.includes('required');

      if (isRequired) {
        openapi.components.schemas[schema.name].required.push(name);
      }

      openapi.components.schemas[schema.name].properties[name] = {
        type: type === 'number' ? 'number' : 'string'
      };
    }

    return openapi;
  }

  const openapi = generateOpenAPISchema(users);
  console.log('\n📡 Generated OpenAPI Schema:\n');
  console.log(JSON.stringify(openapi, null, 2));

  // =================================================================
  // CLEANUP
  // =================================================================
  await db.disconnect();

  console.log('\n✅ Schema introspection demo completed!\n');
  console.log('📝 Key Takeaways:\n');
  console.log('   • resource.$schema contains the original definition');
  console.log('   • Perfect for plugins that need to introspect resources');
  console.log('   • Enables documentation generation');
  console.log('   • Facilitates migration detection');
  console.log('   • Enables API schema generation');
  console.log('   • No conflict with resource.schema (validation/encoding)');
  console.log('   • Follows JSON Schema convention ($schema prefix)\n');
}

main().catch(console.error);
