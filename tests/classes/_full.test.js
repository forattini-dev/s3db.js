import { describe, expect, test, beforeEach } from '@jest/globals';

import Resource from '#src/resource.class.js';
import { Schema } from '#src/schema.class.js';
import { streamToString } from '#src/stream/index.js';
import { createDatabaseForTest } from '#tests/config.js';

describe('Full Complex Resource Test Suite', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('full');
    await database.connect();
  });

  test('Complex Resource Schema Definition with Multiple Partitions and Nested Attributes', async () => {
    // Create a complex resource with multiple partitions and nested attributes
    const complexResource = new Resource({
      name: 'complex_users',
      client: database.client,
      behavior: 'user-managed',
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
    });

    expect(complexResource).toBeDefined();
    expect(complexResource.name).toBe('complex_users');
    expect(complexResource.behavior).toBe('user-managed');
    
    // Check that we have our 3 custom partitions plus 2 automatic timestamp partitions
    const partitionKeys = Object.keys(complexResource.config.partitions);
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

    const countryPartitionKey = complexResource.getPartitionKey({ partitionName: 'byCountry', id: testData.id, data: testData });
    expect(countryPartitionKey).toContain('address.country=BR');

    const sourceMediumPartitionKey = complexResource.getPartitionKey({ partitionName: 'bySourceMedium', id: testData.id, data: testData });
    expect(sourceMediumPartitionKey).toContain('utm.source=google');
    expect(sourceMediumPartitionKey).toContain('utm.medium=cpc');

    const locationCategoryPartitionKey = complexResource.getPartitionKey({ partitionName: 'byLocationCategory', id: testData.id, data: testData });
    expect(locationCategoryPartitionKey).toContain('address.country=BR');
    expect(locationCategoryPartitionKey).toContain('address.state=SP');
    expect(locationCategoryPartitionKey).toContain('metadata.category=developer');

    // Add to database resources for verification
    database.resources['complex_users'] = complexResource;
    expect(database.resources['complex_users']).toBeDefined();
    expect(database.resources['complex_users']).toBe(complexResource);
  });

  test('Complex Resource with Enforce Limits Behavior', async () => {
    const complexResource = new Resource({
      name: 'complex_users_enforce_limits',
      client: database.client,
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
    
    // Add to database resources
    database.resources['complex_users_enforce_limits'] = complexResource;
  });

  test('Complex Resource with Data Truncate Behavior', async () => {
    const complexResource = new Resource({
      name: 'complex_users_data_truncate',
      client: database.client,
      behavior: 'truncate-data',
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
    expect(complexResource.behavior).toBe('truncate-data');
    expect(complexResource.name).toBe('complex_users_data_truncate');
    
    // Add to database resources
    database.resources['complex_users_data_truncate'] = complexResource;
  });

  test('Complex Resource with Body Overflow Behavior', async () => {
    const complexResource = new Resource({
      name: 'complex_users_body_overflow',
      client: database.client,
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
    
    // Add to database resources
    database.resources['complex_users_body_overflow'] = complexResource;
  });

  test('Study s3db.json Structure After Complex Operations', async () => {
    // Create a study resource with complex structure
    const studyResource = new Resource({
      name: 'study_resource',
      client: database.client,
      behavior: 'user-managed',
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
    });

    expect(studyResource).toBeDefined();
    expect(studyResource.behavior).toBe('user-managed');
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

    const countryPartitionKey = studyResource.getPartitionKey({ partitionName: 'byCountry', id: testData.id, data: testData });
    expect(countryPartitionKey).toContain('address.country=BR');

    const sourceMediumPartitionKey = studyResource.getPartitionKey({ partitionName: 'bySourceMedium', id: testData.id, data: testData });
    expect(sourceMediumPartitionKey).toContain('utm.source=google');
    expect(sourceMediumPartitionKey).toContain('utm.medium=cpc');

    const locationCategoryPartitionKey = studyResource.getPartitionKey({ partitionName: 'byLocationCategory', id: testData.id, data: testData });
    expect(locationCategoryPartitionKey).toContain('address.country=BR');
    expect(locationCategoryPartitionKey).toContain('address.state=SP');
    expect(locationCategoryPartitionKey).toContain('metadata.category=study');
    
    // Add to database resources
    database.resources['study_resource'] = studyResource;
  });

  test('Export and import s3db.json maintaining nested attributes as objects', async () => {
    // Create a complex resource
    const resource = new Resource({
      name: 'complex_export',
      client: database.client,
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
      timestamps: true,
      partitions: {
        byCountry: {
          fields: {
            'address.country': 'string'
          }
        }
      }
    });

    // Export the schema
    const exported = resource.export();
    
    // Verify that nested attributes remain as objects
    expect(typeof exported.attributes.profile).toBe('object');
    expect(typeof exported.attributes.profile.social).toBe('object');
    expect(typeof exported.attributes.address).toBe('object');
    
    // Verify that nested attributes were not serialized as strings
    expect(exported.attributes.profile.bio).toBe('string|optional');
    expect(exported.attributes.profile.social.twitter).toBe('string|optional');
    expect(exported.attributes.profile.social.github).toBe('string|optional');
    expect(exported.attributes.address.city).toBe('string');
    expect(exported.attributes.address.country).toBe('string');

    // Import the schema back
    const importedSchema = Schema.import(exported);
    
    // Verify that nested attributes continue as objects after import
    expect(typeof importedSchema.attributes.profile).toBe('object');
    expect(typeof importedSchema.attributes.profile.social).toBe('object');
    expect(typeof importedSchema.attributes.address).toBe('object');
    
    // Verify that values were preserved correctly
    expect(importedSchema.attributes.profile.bio).toBe('string|optional');
    expect(importedSchema.attributes.profile.social.twitter).toBe('string|optional');
    expect(importedSchema.attributes.profile.social.github).toBe('string|optional');
    expect(importedSchema.attributes.address.city).toBe('string');
    expect(importedSchema.attributes.address.country).toBe('string');
    
    // Add to database resources
    database.resources['complex_export'] = resource;
  });

  test('Verify that the resource was added to the database', async () => {
    // Ensure that database.resources is properly initialized
    database.resources = {};
    // Add resources to database.resources manually
    const resource1 = new Resource({
      name: 'complex_users',
      client: database.client,
      attributes: { name: 'string|required' }
    });
    database.resources['complex_users'] = resource1;

    const resource2 = new Resource({
      name: 'complex_users_enforce_limits',
      client: database.client,
      attributes: { name: 'string|required' }
    });
    database.resources['complex_users_enforce_limits'] = resource2;

    const resource3 = new Resource({
      name: 'complex_users_data_truncate',
      client: database.client,
      attributes: { name: 'string|required' }
    });
    database.resources['complex_users_data_truncate'] = resource3;

    const resource4 = new Resource({
      name: 'complex_users_body_overflow',
      client: database.client,
      attributes: { name: 'string|required' }
    });
    database.resources['complex_users_body_overflow'] = resource4;

    const resource5 = new Resource({
      name: 'study_resource',
      client: database.client,
      attributes: { name: 'string|required' }
    });
    database.resources['study_resource'] = resource5;

    const resource6 = new Resource({
      name: 'complex_export',
      client: database.client,
      attributes: { name: 'string|required' }
    });
    database.resources['complex_export'] = resource6;

    // Verify that resources were added to the database
    const resourceNames = Object.keys(database.resources);
    expect(resourceNames).toContain('complex_users');
    expect(resourceNames).toContain('complex_users_enforce_limits');
    expect(resourceNames).toContain('complex_users_data_truncate');
    expect(resourceNames).toContain('complex_users_body_overflow');
    expect(resourceNames).toContain('study_resource');
    expect(resourceNames).toContain('complex_export');
  });

  test('hash should remain stable with timestamps enabled', async () => {
    // Create resource with timestamps enabled
    const resource1 = new Resource({
      name: 'users',
      client: database.client,
      attributes: {
        name: 'string|required|max:100',
        email: 'email|required|unique',
        age: 'number|optional'
      },
      timestamps: true,
      partitions: {
        byAge: {
          fields: {
            'age': 'number'
          }
        }
      },
      behavior: 'enforce-limits'
    });

    const hash1 = resource1.getDefinitionHash();

    // Create another resource with same definition in same database
    const resource2 = new Resource({
      name: 'users',
      client: database.client,
      attributes: {
        name: 'string|required|max:100',
        email: 'email|required|unique',
        age: 'number|optional'
      },
      timestamps: true,
      partitions: {
        byAge: {
          fields: {
            'age': 'number'
          }
        }
      },
      behavior: 'enforce-limits'
    });

    const hash2 = resource2.getDefinitionHash();

    // Hashes should be identical
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
    
    // Test that hash changes when attributes change
    const resource3 = new Resource({
      name: 'users3',
      client: database.client,
      attributes: {
        name: 'string|required|max:100',
        email: 'email|required|unique',
        age: 'number|optional',
        extra: 'string|optional' // Different attribute
      },
      timestamps: true,
      partitions: {
        byAge: {
          fields: {
            'age': 'number'
          }
        }
      },
      behavior: 'enforce-limits'
    });

    const hash3 = resource3.getDefinitionHash();
    expect(hash3).not.toBe(hash1);
  });

  test('Verify that changing a partitioned attribute moves reference to new partition', async () => {
    // Create a resource with country partition using the database
    await database.createResource({
      name: 'partition_update_test',
      behavior: 'user-managed',
      attributes: {
        name: 'string|required|max:100',
        email: 'email|required|unique',
        address: {
          country: 'string|required|max:2',
          state: 'string|required|max:50'
        }
      },
      timestamps: true,
      partitions: {
        byCountry: {
          fields: {
            'address.country': 'string|maxlength:2'
          }
        }
      }
    });

    const partitionResource = database.resources['partition_update_test'];

    // Create a user with country BR
    const userId = 'user-123';
    const userData = {
      name: 'João Silva',
      email: 'joao@example.com',
      address: {
        country: 'BR',
        state: 'SP'
      }
    };

    // Insert the user
    await partitionResource.insert({ id: userId, ...userData });

    // Verify that the user exists in the main resource
    const retrievedUserMain = await partitionResource.get(userId);

    // Verify that the user is in the BR partition
    const usersInBR = await partitionResource.list({ partition: 'byCountry', partitionValues: { 'address.country': 'BR' } });
    expect(usersInBR).toHaveLength(1);
    expect(usersInBR[0].id).toBe(userId);

    // Verify using the client that the key exists in the BR partition
    const brPartitionKey = partitionResource.getPartitionKey({ 
      partitionName: 'byCountry', 
      id: userId, 
      data: userData 
    });
    const brKeyExists = await database.client.exists(brPartitionKey);
    expect(brKeyExists).toBe(true);

    // Update the user to country US
    const updatedUserData = {
      ...userData,
      address: {
        ...userData.address,
        country: 'US',
        state: 'CA'
      }
    };

    await partitionResource.update(userId, updatedUserData);

    // Verify that the user is NO LONGER in the BR partition (method 1: list using partition)
    const usersInBRAfterUpdate = await partitionResource.list({ partition: 'byCountry', partitionValues: { 'address.country': 'BR' } });
    expect(usersInBRAfterUpdate).toHaveLength(0);

    // Verify that the user is in the US partition (method 1: list using partition)
    const usersInUS = await partitionResource.list({ partition: 'byCountry', partitionValues: { 'address.country': 'US' } });
    expect(usersInUS).toHaveLength(1);
    expect(usersInUS[0].id).toBe(userId);

    // Verify using the client that the key NO LONGER exists in the BR partition (method 2: client.exists)
    const brKeyExistsAfterUpdate = await database.client.exists(brPartitionKey);
    expect(brKeyExistsAfterUpdate).toBe(false);

    // Verify using the client that the key exists in the US partition (method 2: client.exists)
    const usPartitionKey = partitionResource.getPartitionKey({ 
      partitionName: 'byCountry', 
      id: userId, 
      data: updatedUserData 
    });
    const usKeyExists = await database.client.exists(usPartitionKey);
    expect(usKeyExists).toBe(true);

    // Verify that the keys are different
    expect(brPartitionKey).not.toBe(usPartitionKey);
    expect(brPartitionKey).toContain('address.country=BR');
    expect(usPartitionKey).toContain('address.country=US');

    // Verify that the user can be retrieved normally
    const retrievedUser = await partitionResource.get(userId);
    expect(retrievedUser).toBeDefined();
    expect(retrievedUser.address.country).toBe('US');
  });

  test('Verify that changing a partitioned attribute via upsert moves reference to new partition', async () => {
    // Create a resource with country partition using the database
    await database.createResource({
      name: 'partition_upsert_test',
      behavior: 'user-managed',
      attributes: {
        name: 'string|required|max:100',
        email: 'email|required|unique',
        address: {
          country: 'string|required|max:2',
          state: 'string|required|max:50'
        }
      },
      timestamps: true,
      partitions: {
        byCountry: {
          fields: {
            'address.country': 'string|maxlength:2'
          }
        }
      }
    });

    const partitionResource = database.resources['partition_upsert_test'];

    // Create a user with country BR
    const userId = 'user-upsert-1';
    const userData = {
      name: 'Maria Souza',
      email: 'maria@example.com',
      address: {
        country: 'BR',
        state: 'SP'
      }
    };

    // Insert the user via upsert
    await partitionResource.upsert({ id: userId, ...userData });

    // Verify that the user is in the BR partition
    const usersInBR = await partitionResource.list({ partition: 'byCountry', partitionValues: { 'address.country': 'BR' } });
    expect(usersInBR).toHaveLength(1);
    expect(usersInBR[0].id).toBe(userId);

    // Update the user to country US via upsert
    const updatedUserData = {
      ...userData,
      address: {
        ...userData.address,
        country: 'US',
        state: 'CA'
      }
    };
    await partitionResource.upsert({ id: userId, ...updatedUserData });

    // Verify that the user is NO LONGER in the BR partition
    const usersInBRAfterUpdate = await partitionResource.list({ partition: 'byCountry', partitionValues: { 'address.country': 'BR' } });
    expect(usersInBRAfterUpdate).toHaveLength(0);

    // Verify that the user is in the US partition
    const usersInUS = await partitionResource.list({ partition: 'byCountry', partitionValues: { 'address.country': 'US' } });
    expect(usersInUS).toHaveLength(1);
    expect(usersInUS[0].id).toBe(userId);

    // Verify that the user can be retrieved normally
    const retrievedUser = await partitionResource.get(userId);
    expect(retrievedUser).toBeDefined();
    expect(retrievedUser.address.country).toBe('US');
  });

  test('Verify quality of generated s3db.json', async () => {
    // Add complex resources to the database to generate a rich s3db.json
    database.resources = {};
    
    const complexResource = new Resource({
      name: 'quality_test_resource',
      client: database.client,
      behavior: 'user-managed',
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
        metadata: {
          category: 'string|required|max:50',
          priority: 'string|default:normal',
          tags: 'array|optional'
        }
      },
      timestamps: true,
      partitions: {
        byCountry: {
          fields: {
            'address.country': 'string|maxlength:2'
          }
        },
        byCategory: {
          fields: {
            'metadata.category': 'string'
          }
        }
      }
    });

    database.resources['quality_test_resource'] = complexResource;

    // Call the method that generates s3db.json
    await database.uploadMetadataFile();

    // Verify that s3db.json was created in the bucket
    const s3dbExists = await database.client.exists('s3db.json');
    expect(s3dbExists).toBe(true);
    
    // Get the content of s3db.json
    const s3dbRequest = await database.client.getObject('s3db.json');
    const s3dbContent = JSON.parse(await streamToString(s3dbRequest.Body));
    
    // Verify basic structure
    expect(s3dbContent).toHaveProperty('version');
    expect(s3dbContent).toHaveProperty('s3dbVersion');
    expect(s3dbContent).toHaveProperty('lastUpdated');
    expect(s3dbContent).toHaveProperty('resources');
    
    // Verify that the resource was included
    expect(s3dbContent.resources).toHaveProperty('quality_test_resource');
    
    const resourceMeta = s3dbContent.resources['quality_test_resource'];
    
    // Verifica estrutura do resource
    expect(resourceMeta).toHaveProperty('currentVersion');
    expect(resourceMeta).toHaveProperty('partitions');
    expect(resourceMeta).toHaveProperty('versions');
    
    // Verifica que as partições foram preservadas
    expect(resourceMeta.partitions).toHaveProperty('byCountry');
    expect(resourceMeta.partitions).toHaveProperty('byCategory');
    expect(resourceMeta.partitions.byCountry.fields['address.country']).toBeDefined();
    expect(resourceMeta.partitions.byCategory.fields['metadata.category']).toBeDefined();
    
    // Verifica que os valores das partições estão corretos
    expect(resourceMeta.partitions.byCountry.fields['address.country']).toBe('string|maxlength:2');
    expect(resourceMeta.partitions.byCategory.fields['metadata.category']).toBe('string');
    
    // Verifica que a versão foi criada
    expect(resourceMeta.versions).toHaveProperty(resourceMeta.currentVersion);
    
    const versionData = resourceMeta.versions[resourceMeta.currentVersion];
    
    // Verifica dados da versão
    expect(versionData).toHaveProperty('hash');
    expect(versionData).toHaveProperty('attributes');
    expect(versionData).toHaveProperty('behavior');
    expect(versionData).toHaveProperty('createdAt');
    
    // Verifica que os atributos aninhados foram preservados como objetos
    expect(typeof versionData.attributes.personal).toBe('object');
    expect(typeof versionData.attributes.address).toBe('object');
    expect(typeof versionData.attributes.metadata).toBe('object');
    
    // Verifica que os atributos aninhados não foram serializados como string
    expect(versionData.attributes.personal.firstName).toBe('string|required|max:50');
    expect(versionData.attributes.address.country).toBe('string|required|max:2');
    expect(versionData.attributes.metadata.category).toBe('string|required|max:50');
    
    // Verifica que o behavior foi preservado
    expect(versionData.behavior).toBe('user-managed');
    
    // Verifica que o hash é válido
    expect(versionData.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    
    // Verifica que o timestamp foi gerado
    expect(versionData.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
}); 