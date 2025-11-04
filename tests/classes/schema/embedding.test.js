import { describe, expect, test } from '@jest/globals';

import Schema from '#src/schema.class.js';

const buildEmbeddingArray = length =>
  Array.from({ length }, (_, index) => Math.sin(index) * 0.75);

describe('Schema embedding mappings', () => {
  test('maps and unmaps supported embedding dimensions', async () => {
    for (const length of [256, 768, 1536]) {
      const schema = new Schema({
        name: `embedding-${length}`,
        attributes: { vector: `embedding:${length}` }
      });

      const data = { vector: buildEmbeddingArray(length) };
      const mapped = await schema.mapper(data);

      const key = schema.map.vector;
      expect(typeof mapped[key]).toBe('string');
      expect(mapped[key]).toContain('^'); // fixed-point payload

      const unmapped = await schema.unmapper(mapped);
      expect(unmapped.vector).toHaveLength(length);
      unmapped.vector.forEach((value, index) => {
        expect(value).toBeCloseTo(data.vector[index], 5);
      });
    }
  });

  test('preserves precision for typical embedding ranges', async () => {
    const schema = new Schema({
      name: 'embedding-precision',
      attributes: { vector: 'embedding:512' }
    });

    const sample = [0, 1, -1, 0.987654, -0.43721, 1e-6, 0.333333];
    const longVector = [...sample];
    while (longVector.length < 512) {
      longVector.push(sample[longVector.length % sample.length]);
    }

    const unmapped = await schema.unmapper(await schema.mapper({ vector: longVector }));
    unmapped.vector.forEach((value, index) => {
      expect(value).toBeCloseTo(longVector[index], 5);
    });
  });
});

describe('Schema embedding hooks', () => {
  test('assigns embedding hook utilities without conflicting with integer arrays', async () => {
    const schema = new Schema({
      name: 'embedding-hooks',
      attributes: {
        embedding: 'embedding:768',
        integers: 'array|items:number|integer:true'
      }
    });

    expect(schema.options.hooks.beforeMap.embedding).toEqual(['fromArrayOfEmbeddings']);
    expect(schema.options.hooks.afterUnmap.embedding).toEqual(['toArrayOfEmbeddings']);

    expect(schema.options.hooks.beforeMap.integers).toEqual(['fromArrayOfNumbers']);
    expect(schema.options.hooks.afterUnmap.integers).toEqual(['toArrayOfNumbers']);

    const mapped = await schema.mapper({
      embedding: buildEmbeddingArray(768),
      integers: [1, 2, 3]
    });

    expect(mapped[schema.map.embedding]).toContain('^');
    expect(mapped[schema.map.integers]).not.toContain('^');
  });

  test('supports shorthand, pipe and object notation for embeddings', async () => {
    const shorthand = new Schema({
      name: 'embedding-shorthand',
      attributes: { vector: 'embedding:1536' }
    });
    expect(shorthand.options.hooks.beforeMap.vector).toEqual(['fromArrayOfEmbeddings']);

    const pipe = new Schema({
      name: 'embedding-pipe',
      attributes: { vector: 'embedding|length:768' }
    });
    expect(pipe.options.hooks.beforeMap.vector).toEqual(['fromArrayOfEmbeddings']);

    const objectNotation = new Schema({
      name: 'embedding-object',
      attributes: {
        embedding: {
          type: 'array',
          items: 'number',
          length: 512
        }
      }
    });
    expect(objectNotation.options.hooks.beforeMap.embedding).toEqual(['fromArrayOfEmbeddings']);

    const optionalSchema = new Schema({
      name: 'embedding-optional',
      attributes: {
        id: 'string|optional',
        vector: 'embedding:768|optional:true'
      }
    });

    await expect(optionalSchema.validate({ id: 'doc1' })).resolves.toBe(true);
    await expect(
      optionalSchema.validate({ id: 'doc2', vector: buildEmbeddingArray(768) })
    ).resolves.toBe(true);
  });
});
