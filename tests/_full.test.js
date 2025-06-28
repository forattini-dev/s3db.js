import { join } from 'path';
import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';

import Database from '../src/database.class.js';
import Resource from '../src/resource.class.js';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'full-complex-resource-' + Date.now());

describe('Full Complex Resource Test Suite', () => {
  let database;

  beforeEach(async () => {
    database = new Database({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    });

    await database.connect();
  });

  test('Complex Resource Schema Definition with Multiple Partitions and Nested Attributes', async () => {
    // Create a complex resource with multiple partitions and nested attributes
    const complexResource = await database.createResource({
      name: 'complex_users',
      behavior: 'user-management',
      attributes: {
        // Basic fields
        name: 'string|required|max:100',
        email: 'email|required|unique',
        age: 'number|optional|min:0|max:150',
        active: 'boolean|default:true',
        
        // Nested personal information
        personal: {
          firstName: 'string|required|max:50',
          lastName: 'string|required|max:50',
          birthDate: 'date|optional',
          gender: 'string|optional',
          phone: 'string|optional|max:20'
        },
        
        // Nested address information
        address: {
          street: 'string|required|max:200',
          city: 'string|required|max:100',
          state: 'string|required|max:50',
          country: 'string|required|max:2',
          zipCode: 'string|optional|max:20',
          coordinates: {
            latitude: 'number|optional|min:-90|max:90',
            longitude: 'number|optional|min:-180|max:180'
          }
        },
        
        // Nested UTM tracking
        utm: {
          source: 'string|required|max:50',
          medium: 'string|required|max:50',
          campaign: 'string|optional|max:100',
          term: 'string|optional|max:100',
          content: 'string|optional|max:100'
        },
        
        // Nested preferences
        preferences: {
          theme: 'string|default:light',
          language: 'string|default:en|max:5',
          notifications: {
            email: 'boolean|default:true',
            push: 'boolean|default:true',
            sms: 'boolean|default:false'
          },
          privacy: {
            profileVisibility: 'string|default:public',
            dataSharing: 'boolean|default:false'
          }
        },
        
        // Nested metadata
        metadata: {
          category: 'string|required|max:50',
          priority: 'string|default:normal',
          tags: 'array|optional',
          notes: 'string|optional|max:1000',
          source: 'string|optional|max:100',
          version: 'string|optional|max:20'
        }
      },
      options: {
        timestamps: true,
        partitions: {
          // Partition 1: Single attribute
          byCountry: {
            fields: {
              'address.country': 'string|maxlength:2'
            }
          },
          
          // Partition 2: Two attributes
          bySourceMedium: {
            fields: {
              'utm.source': 'string',
              'utm.medium': 'string'
            }
          },
          
          // Partition 3: Three attributes
          byLocationCategory: {
            fields: {
              'address.country': 'string|maxlength:2',
              'address.state': 'string',
              'metadata.category': 'string'
            }
          }
        }
      }
    });

    expect(complexResource).toBeDefined();
    expect(complexResource.name).toBe('complex_users');
    expect(complexResource.behavior).toBe('user-management');
    
    // Check that we have our 3 custom partitions plus 2 automatic timestamp partitions
    const partitionKeys = Object.keys(complexResource.options.partitions);
    expect(partitionKeys).toContain('byCountry');
    expect(partitionKeys).toContain('bySourceMedium');
    expect(partitionKeys).toContain('byLocationCategory');
    expect(partitionKeys).toContain('byCreatedDate');
    expect(partitionKeys).toContain('byUpdatedDate');
    expect(partitionKeys).toHaveLength(5);

    // Test partition key generation
    const testData = {
      id: 'test-id',
      name: 'Test User',
      email: 'test@example.com',
      address: {
        country: 'BR',
        state: 'SP'
      },
      utm: {
        source: 'google',
        medium: 'cpc'
      },
      metadata: {
        category: 'developer'
      }
    };

    const countryPartitionKey = complexResource.getPartitionKey('byCountry', testData.id, testData);
    expect(countryPartitionKey).toContain('address.country=BR');

    const sourceMediumPartitionKey = complexResource.getPartitionKey('bySourceMedium', testData.id, testData);
    expect(sourceMediumPartitionKey).toContain('utm.source=google');
    expect(sourceMediumPartitionKey).toContain('utm.medium=cpc');

    const locationCategoryPartitionKey = complexResource.getPartitionKey('byLocationCategory', testData.id, testData);
    expect(locationCategoryPartitionKey).toContain('address.country=BR');
    expect(locationCategoryPartitionKey).toContain('address.state=SP');
    expect(locationCategoryPartitionKey).toContain('metadata.category=developer');

    // Verify the resource was added to database resources
    expect(database.resources['complex_users']).toBeDefined();
    expect(database.resources['complex_users']).toBe(complexResource);
  });

  test('Complex Resource with Enforce Limits Behavior', async () => {
    const complexResource = await database.createResource({
      name: 'complex_users_enforce_limits',
      behavior: 'enforce-limits',
      attributes: {
        name: 'string|required|max:100',
        email: 'email|required|unique',
        personal: {
          firstName: 'string|required|max:50',
          lastName: 'string|required|max:50'
        },
        address: {
          country: 'string|required|max:2',
          state: 'string|required|max:50'
        },
        utm: {
          source: 'string|required|max:50',
          medium: 'string|required|max:50'
        },
        metadata: {
          category: 'string|required|max:50'
        }
      },
      options: {
        timestamps: true,
        partitions: {
          byCountry: {
            fields: {
              'address.country': 'string|maxlength:2'
            }
          }
        }
      }
    });

    expect(complexResource).toBeDefined();
    expect(complexResource.behavior).toBe('enforce-limits');
    expect(complexResource.name).toBe('complex_users_enforce_limits');
  });

  test('Complex Resource with Data Truncate Behavior', async () => {
    const complexResource = await database.createResource({
      name: 'complex_users_data_truncate',
      behavior: 'data-truncate',
      attributes: {
        name: 'string|required|max:100',
        email: 'email|required|unique',
        bio: 'string|optional|max:1000',
        description: 'string|optional|max:1000',
        notes: 'string|optional|max:1000',
        personal: {
          firstName: 'string|required|max:50',
          lastName: 'string|required|max:50'
        },
        address: {
          country: 'string|required|max:2',
          state: 'string|required|max:50'
        },
        utm: {
          source: 'string|required|max:50',
          medium: 'string|required|max:50'
        },
        metadata: {
          category: 'string|required|max:50'
        }
      },
      options: {
        timestamps: true,
        partitions: {
          byCountry: {
            fields: {
              'address.country': 'string|maxlength:2'
            }
          }
        }
      }
    });

    expect(complexResource).toBeDefined();
    expect(complexResource.behavior).toBe('data-truncate');
    expect(complexResource.name).toBe('complex_users_data_truncate');
  });

  test('Complex Resource with Body Overflow Behavior', async () => {
    const complexResource = await database.createResource({
      name: 'complex_users_body_overflow',
      behavior: 'body-overflow',
      attributes: {
        name: 'string|required|max:100',
        email: 'email|required|unique',
        bio: 'string|optional|max:5000',
        description: 'string|optional|max:5000',
        notes: 'string|optional|max:5000',
        personal: {
          firstName: 'string|required|max:50',
          lastName: 'string|required|max:50'
        },
        address: {
          country: 'string|required|max:2',
          state: 'string|required|max:50'
        },
        utm: {
          source: 'string|required|max:50',
          medium: 'string|required|max:50'
        },
        metadata: {
          category: 'string|required|max:50'
        }
      },
      options: {
        timestamps: true,
        partitions: {
          byCountry: {
            fields: {
              'address.country': 'string|maxlength:2'
            }
          }
        }
      }
    });

    expect(complexResource).toBeDefined();
    expect(complexResource.behavior).toBe('body-overflow');
    expect(complexResource.name).toBe('complex_users_body_overflow');
  });

  test('Study s3db.json Structure After Complex Operations', async () => {
    // Create a study resource with complex structure
    const studyResource = await database.createResource({
      name: 'study_resource',
      behavior: 'user-management',
      attributes: {
        name: 'string|required|max:100',
        email: 'email|required|unique',
        personal: {
          firstName: 'string|required|max:50',
          lastName: 'string|required|max:50',
          birthDate: 'date|optional'
        },
        address: {
          country: 'string|required|max:2',
          state: 'string|required|max:50',
          city: 'string|required|max:100'
        },
        utm: {
          source: 'string|required|max:50',
          medium: 'string|required|max:50',
          campaign: 'string|optional|max:100'
        },
        metadata: {
          category: 'string|required|max:50',
          priority: 'string|default:normal',
          tags: 'array|optional'
        }
      },
      options: {
        timestamps: true,
        partitions: {
          byCountry: {
            fields: {
              'address.country': 'string|maxlength:2'
            }
          },
          bySourceMedium: {
            fields: {
              'utm.source': 'string',
              'utm.medium': 'string'
            }
          },
          byLocationCategory: {
            fields: {
              'address.country': 'string|maxlength:2',
              'address.state': 'string',
              'metadata.category': 'string'
            }
          }
        }
      }
    });

    expect(studyResource).toBeDefined();
    expect(studyResource.behavior).toBe('user-management');
    expect(studyResource.name).toBe('study_resource');

    // Test partition key generation
    const testData = {
      id: 'test-id',
      name: 'Test User',
      email: 'test@example.com',
      address: {
        country: 'BR',
        state: 'SP'
      },
      utm: {
        source: 'google',
        medium: 'cpc'
      },
      metadata: {
        category: 'study'
      }
    };

    const countryPartitionKey = studyResource.getPartitionKey('byCountry', testData.id, testData);
    expect(countryPartitionKey).toContain('address.country=BR');

    const sourceMediumPartitionKey = studyResource.getPartitionKey('bySourceMedium', testData.id, testData);
    expect(sourceMediumPartitionKey).toContain('utm.source=google');
    expect(sourceMediumPartitionKey).toContain('utm.medium=cpc');

    const locationCategoryPartitionKey = studyResource.getPartitionKey('byLocationCategory', testData.id, testData);
    expect(locationCategoryPartitionKey).toContain('address.country=BR');
    expect(locationCategoryPartitionKey).toContain('address.state=SP');
    expect(locationCategoryPartitionKey).toContain('metadata.category=study');
  });

  test('Exporta e importa s3db.json mantendo atributos aninhados como objetos', async () => {
    // Cria uma resource complexa
    const resource = await database.createResource({
      name: 'complex_export',
      attributes: {
        name: 'string|required',
        profile: {
          bio: 'string|optional',
          social: {
            twitter: 'string|optional',
            github: 'string|optional'
          }
        },
        address: {
          city: 'string',
          country: 'string'
        }
      },
      options: {
        timestamps: true,
        partitions: {
          byCountry: {
            fields: { 'address.country': 'string' }
          }
        }
      }
    });

    expect(resource).toBeDefined();
    expect(resource.name).toBe('complex_export');

    // Simula export/import do s3db.json
    const { Schema } = await import('../src/schema.class.js');
    const exported = resource.schema.export();
    // Simula salvar e carregar do disco
    const exportedJson = JSON.stringify(exported);
    const loaded = Schema.import(JSON.parse(exportedJson));

    // Verifica se os atributos aninhados continuam objetos
    const attrs = loaded.attributes;
    expect(typeof attrs.profile).toBe('object');
    expect(typeof attrs.profile.social).toBe('object');
    expect(typeof attrs.profile.social.twitter).toBe('string');
    expect(typeof attrs.address).toBe('object');
    expect(typeof attrs.address.city).toBe('string');

    // Verifica que não há objetos serializados como string
    expect(() => JSON.parse(attrs.profile)).toThrow();
    expect(() => JSON.parse(attrs.profile.social)).toThrow();

    // Agora tenta criar um novo resource com o schema importado
    const ResourceClass = (await import('../src/resource.class.js')).default;
    const newResource = new ResourceClass({
      name: 'complex_export',
      client: database.client,
      attributes: loaded.attributes,
      options: resource.options
    });
    expect(newResource.schema.attributes.profile).toBeDefined();
    expect(typeof newResource.schema.attributes.profile).toBe('object');
    expect(typeof newResource.schema.attributes.profile.social).toBe('object');
  });

  test('Database Resources Verification', async () => {
    // Verify all resources were created
    const resources = await database.listResources();
    expect(resources.length).toBeGreaterThanOrEqual(5);
    
    // Check that all expected resources exist
    const resourceNames = resources.map(r => r.name);
    expect(resourceNames).toContain('complex_users');
    expect(resourceNames).toContain('complex_users_enforce_limits');
    expect(resourceNames).toContain('complex_users_data_truncate');
    expect(resourceNames).toContain('complex_users_body_overflow');
    expect(resourceNames).toContain('study_resource');
    expect(resourceNames).toContain('complex_export');
  });
}); 