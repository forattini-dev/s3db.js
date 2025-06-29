import { S3db } from "../src/index.js";

// Create S3DB instance
const db = new S3db({
  connectionString: "s3://test-bucket",
  passphrase: "test-passphrase"
});

// Define attributes in different orders
const attributes1 = {
  name: 'string|required',
  email: 'string|required',
  age: 'number|optional',
  password: 'secret|required'
};

const attributes2 = {
  email: 'string|required',
  password: 'secret|required',
  age: 'number|optional',
  name: 'string|required'
};

const attributes3 = {
  age: 'number|optional',
  name: 'string|required',
  password: 'secret|required',
  email: 'string|required'
};

// Create resources with same name but different attribute orders
const resource1 = await db.createResource({
  name: 'users',
  attributes: attributes1
});

const resource2 = await db.createResource({
  name: 'users2', // Different name to avoid conflict
  attributes: attributes2
});

const resource3 = await db.createResource({
  name: 'users3', // Different name to avoid conflict
  attributes: attributes3
});

// Generate hashes
const hash1 = resource1.getDefinitionHash();
const hash2 = resource2.getDefinitionHash();
const hash3 = resource3.getDefinitionHash();

console.log('=== Consistent Hash Generation Demo ===');
console.log('\nResource 1 (original order):');
console.log('Attributes:', JSON.stringify(attributes1, null, 2));
console.log('Hash:', hash1);

console.log('\nResource 2 (reordered):');
console.log('Attributes:', JSON.stringify(attributes2, null, 2));
console.log('Hash:', hash2);

console.log('\nResource 3 (different reorder):');
console.log('Attributes:', JSON.stringify(attributes3, null, 2));
console.log('Hash:', hash3);

console.log('\n=== Hash Comparison ===');
console.log('Hash1 === Hash2:', hash1 === hash2);
console.log('Hash1 === Hash3:', hash1 === hash3);
console.log('Hash2 === Hash3:', hash2 === hash3);

// Test with different resource names
const resource4 = await db.createResource({
  name: 'customers', // Different name
  attributes: attributes1 // Same attributes as resource1
});

const hash4 = resource4.getDefinitionHash();

console.log('\n=== Different Resource Name ===');
console.log('Resource 4 (name: customers):');
console.log('Hash:', hash4);
console.log('Hash1 === Hash4:', hash1 === hash4);

// Test with different attributes
const attributes5 = {
  name: 'string|required',
  email: 'string|required',
  age: 'number|optional',
  password: 'secret|required',
  phone: 'string|optional' // Additional field
};

const resource5 = await db.createResource({
  name: 'users5',
  attributes: attributes5
});

const hash5 = resource5.getDefinitionHash();

console.log('\n=== Different Attributes ===');
console.log('Resource 5 (with additional phone field):');
console.log('Attributes:', JSON.stringify(attributes5, null, 2));
console.log('Hash:', hash5);
console.log('Hash1 === Hash5:', hash1 === hash5);

console.log('\n=== Summary ===');
console.log('✅ Same name + same attributes (different order) = Same hash');
console.log('❌ Different name + same attributes = Different hash');
console.log('❌ Same name + different attributes = Different hash'); 