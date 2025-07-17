import { setupDatabase } from './database.js';

async function run() {
  const db = await setupDatabase();

  const resource = await db.createResource({
    name: 'arrays_test',
    attributes: {
      id: 'string|required',
      tags: 'array|items:string',
      scores: 'array|items:number',
      metadata: 'object'
    },
    behavior: 'user-managed'
  });

  // Insert a record with arrays of strings and numbers
  const inserted = await resource.insert({
    id: 'test1',
    tags: ['alpha', 'beta|gamma', 'delta'],
    scores: [10, 255, 12345],
    metadata: { foo: 'bar', count: 2 }
  });
  console.log('Inserted:', inserted);

  // Retrieve the record
  const found = await resource.findOne({ id: 'test1' });
  console.log('Retrieved:', found);

  // Check round-trip correctness
  const tagsOk = Array.isArray(found.tags) && found.tags[1] === 'beta|gamma';
  const scoresOk = Array.isArray(found.scores) && found.scores[2] === 12345;
  if (tagsOk && scoresOk) {
    console.log('✅ Arrays of strings and numbers round-trip correctly!');
  } else {
    console.error('❌ Array round-trip failed:', { tags: found.tags, scores: found.scores });
  }

  // Clean up
  if (db.teardown) await db.teardown();
}

run().catch(console.error); 