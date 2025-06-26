import { cloneDeep } from 'lodash-es';
import { describe, expect, test } from '@jest/globals';

import Schema from '../src/schema.class.js'

describe('Schema Class - Complete Journey', () => {
  
  test('Schema Journey: Create → Validate → Map → Serialize → Deserialize → Unmap', async () => {
    console.log('\n🚀 Starting Schema Journey...\n');

    // 1. Create Schema with diverse field types
    console.log('1️⃣ Creating Schema with multiple field types...');
    const schema = new Schema({
      name: 'users',
      attributes: {
        // Basic types
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional',
        active: 'boolean|default:true',
        
        // Special types
        password: 'secret|min:8',
        phones: 'array|items:string',
        tags: 'array|items:string',
        
        // Nested object
        profile: {
          $$type: 'object',
          bio: 'string|optional',
          website: 'url|optional'
        },
        
        // Empty object test cases
        metadata: {
          $$type: 'object',
          category: 'string|optional',
          priority: 'number|optional'
        }
      },
      options: {
        autoEncrypt: true,
        autoDecrypt: true,
        arraySeparator: '|'
      }
    });

    expect(schema.name).toBe('users');
    expect(schema.version).toBe(1);
    expect(schema.options.autoEncrypt).toBe(true);
    console.log('✅ Schema created successfully');

    // 2. Test complex data with edge cases
    console.log('\n2️⃣ Preparing test data with edge cases...');
    const testData = {
      name: 'João Silva',
      email: 'joao@example.com',
      age: 30,
      active: true,
      password: 'secret123456',
      phones: ['11999999999', '11888888888'],
      tags: ['developer', 'javascript', 'node.js'],
      profile: {
        bio: 'Desenvolvedor Full Stack',
        website: 'https://joao.dev'
      },
      metadata: {} // Empty object test
    };

    console.log('Test data:', JSON.stringify(testData, null, 2));

    // 3. Validate the data
    console.log('\n3️⃣ Validating data...');
    const validationResult = await schema.validate(testData, { mutateOriginal: true });
    expect(validationResult).toBe(true);
    console.log('✅ Data validation passed');

    // 4. Map the data (apply transformations)
    console.log('\n4️⃣ Mapping data (applying transformations)...');
    const mappedData = await schema.mapper(cloneDeep(testData));
    
    console.log('Mapped data keys:', Object.keys(mappedData));
    expect(mappedData).toHaveProperty('_v');
    expect(mappedData._v).toBe('1');
    
    // Arrays should be serialized with separators
    // Need to find the mapped keys for phones and tags arrays
    console.log('Mapped data:', mappedData);
    const phonesKey = Object.keys(mappedData).find(key => 
      mappedData[key] === '11999999999|11888888888'
    );
    const tagsKey = Object.keys(mappedData).find(key => 
      mappedData[key] === 'developer|javascript|node.js'
    );
    
    expect(phonesKey).toBeDefined();
    expect(tagsKey).toBeDefined();
    expect(mappedData[phonesKey]).toBe('11999999999|11888888888');
    expect(mappedData[tagsKey]).toBe('developer|javascript|node.js');
    
    console.log('✅ Data mapping completed');

    // 5. Test array edge cases
    console.log('\n5️⃣ Testing array edge cases...');
    
    // Empty arrays
    const emptyArrayData = { ...testData, phones: [], tags: [] };
    const mappedEmpty = await schema.mapper(cloneDeep(emptyArrayData));
    
    const emptyPhonesKey = Object.keys(mappedEmpty).find(key => 
      mappedEmpty[key] === '[]' && key !== '_v'
    );
    expect(emptyPhonesKey).toBeDefined();
    expect(mappedEmpty[emptyPhonesKey]).toBe('[]'); // Empty array marker
    
    // Arrays with special characters
    const specialArrayData = { 
      ...testData, 
      phones: ['555|special', '555-with|pipe'],
      tags: ['tag|with|pipes', 'normal-tag']
    };
    const mappedSpecial = await schema.mapper(cloneDeep(specialArrayData));
    
    const specialPhonesKey = Object.keys(mappedSpecial).find(key => 
      mappedSpecial[key] === '555\\|special|555-with\\|pipe'
    );
    const specialTagsKey = Object.keys(mappedSpecial).find(key => 
      mappedSpecial[key] === 'tag\\|with\\|pipes|normal-tag'
    );
    expect(specialPhonesKey).toBeDefined();
    expect(specialTagsKey).toBeDefined();
    
    // Null and undefined arrays
    const nullArrayData = { ...testData, phones: null, tags: undefined };
    const mappedNull = await schema.mapper(cloneDeep(nullArrayData));
    
    const nullPhonesKey = Object.keys(mappedNull).find(key => 
      mappedNull[key] === null && key !== '_v'
    );
    expect(nullPhonesKey).toBeDefined();
    expect(mappedNull[nullPhonesKey]).toBe(null);
    
    console.log('✅ Array edge cases handled correctly');

    // 6. Test object edge cases  
    console.log('\n6️⃣ Testing object edge cases...');
    
    // Empty objects
    const emptyObjectData = { 
      ...testData, 
      profile: {},
      metadata: {}
    };
    const mappedEmptyObj = await schema.mapper(cloneDeep(emptyObjectData));
    
    // Should have mapped keys for empty objects
    const profileKey = Object.keys(mappedEmptyObj).find(key => 
      typeof mappedEmptyObj[key] === 'object' && 
      Object.keys(mappedEmptyObj[key]).length === 0 && 
      key !== '_v'
    );
    expect(profileKey).toBeDefined();
    expect(mappedEmptyObj[profileKey]).toEqual({});
    
    // Null objects
    const nullObjectData = { 
      ...testData, 
      profile: null,
      metadata: null 
    };
    const mappedNullObj = await schema.mapper(cloneDeep(nullObjectData));
    
    const nullProfileKey = Object.keys(mappedNullObj).find(key => 
      mappedNullObj[key] === null && key !== '_v'
    );
    expect(nullProfileKey).toBeDefined();
    expect(mappedNullObj[nullProfileKey]).toBe(null);
    
    console.log('✅ Object edge cases handled correctly');

    // 7. Unmap the data (reverse transformations)
    console.log('\n7️⃣ Unmapping data (reverse transformations)...');
    const unmappedData = await schema.unmapper(cloneDeep(mappedData));
    
    console.log('Unmapped data:', JSON.stringify(unmappedData, null, 2));
    
    // Verify data integrity
    expect(unmappedData.name).toBe(testData.name);
    expect(unmappedData.email).toBe(testData.email);
    expect(unmappedData.age).toBe(testData.age);
    expect(unmappedData.active).toBe(testData.active);
    
    // Arrays should be restored
    expect(Array.isArray(unmappedData.phones)).toBe(true);
    expect(unmappedData.phones).toEqual(testData.phones);
    expect(Array.isArray(unmappedData.tags)).toBe(true);  
    expect(unmappedData.tags).toEqual(testData.tags);
    
    // Objects should be restored
    expect(unmappedData.profile).toEqual(testData.profile);
    expect(unmappedData.metadata).toEqual(testData.metadata);
    
    console.log('✅ Data unmapping completed successfully');

    // 8. Test special array cases unmapping
    console.log('\n8️⃣ Testing special array cases unmapping...');
    
    // Empty arrays
    const unmappedEmpty = await schema.unmapper(cloneDeep(mappedEmpty));
    expect(unmappedEmpty.phones).toEqual([]);
    expect(unmappedEmpty.tags).toEqual([]);
    
    // Special characters  
    const unmappedSpecial = await schema.unmapper(cloneDeep(mappedSpecial));
    expect(unmappedSpecial.phones).toEqual(['555|special', '555-with|pipe']);
    expect(unmappedSpecial.tags).toEqual(['tag|with|pipes', 'normal-tag']);
    
    // Null values
    const unmappedNull = await schema.unmapper(cloneDeep(mappedNull));
    expect(unmappedNull.phones).toBe(null);
    expect(unmappedNull.tags).toBe(undefined);
    
    console.log('✅ Special array cases unmapped correctly');

    // 9. Test object cases unmapping
    console.log('\n9️⃣ Testing object cases unmapping...');
    
    // Empty objects
    const unmappedEmptyObj = await schema.unmapper(cloneDeep(mappedEmptyObj));
    expect(unmappedEmptyObj.profile).toEqual({});
    expect(unmappedEmptyObj.metadata).toEqual({});
    
    // Null objects
    const unmappedNullObj = await schema.unmapper(cloneDeep(mappedNullObj));
    expect(unmappedNullObj.profile).toBe(null);
    expect(unmappedNullObj.metadata).toBe(null);
    
    console.log('✅ Object cases unmapped correctly');

    // 10. Verify schema export
    console.log('\n🔟 Testing schema export...');
    const exportedSchema = schema.export();
    expect(exportedSchema.name).toBe('users');
    expect(exportedSchema.version).toBe(1);
    expect(exportedSchema.attributes).toBeDefined();
    expect(exportedSchema.map).toBeDefined();
    
    console.log('✅ Schema export working correctly');

    console.log('\n🎉 Schema Journey completed successfully! All edge cases handled correctly.\n');
  });

  test('Schema Auto-Hooks Generation Journey', async () => {
    console.log('\n🔧 Testing Auto-Hooks Generation...\n');

    const schema = new Schema({
      name: 'testHooks',
      attributes: {
        email: 'email',
        phones: 'array|items:string',
        age: 'number',
        active: 'boolean',
        password: 'secret',
      },
    });

    // Verify auto-generated hooks
    expect(schema.options.hooks.beforeMap.phones).toEqual(['fromArray']);
    expect(schema.options.hooks.afterUnmap.phones).toEqual(['toArray']);
    
    expect(schema.options.hooks.beforeMap.age).toEqual(['toString']);
    expect(schema.options.hooks.afterUnmap.age).toEqual(['toNumber']);
    
    expect(schema.options.hooks.beforeMap.active).toEqual(['fromBool']);
    expect(schema.options.hooks.afterUnmap.active).toEqual(['toBool']);
    
    expect(schema.options.hooks.afterUnmap.password).toEqual(['decrypt']);

    console.log('✅ Auto-hooks generation verified');
  });

  test('Manual Hooks Journey', async () => {
    console.log('\n🛠️  Testing Manual Hooks...\n');

    const schema = new Schema({
      name: 'manualHooks',
      attributes: {
        name: 'string',
        surname: 'string',
      },
      options: {
        generateAutoHooks: false,
        hooks: {
          beforeMap: {
            name: ['trim'],
          },
        }
      }
    });

    expect(schema.options.hooks.beforeMap.name).toEqual(['trim']);
    
    // Test adding hooks manually
    schema.addHook('beforeMap', 'surname', 'trim');
    expect(schema.options.hooks.beforeMap.surname).toEqual(['trim']);

    console.log('✅ Manual hooks working correctly');
  });
});

