import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import { calculateEncodedSize } from '../../src/concerns/metadata-encoding.js';

describe('Smart Encoding Efficiency Test', () => {
  let db;
  let resource;

  beforeAll(async () => {
    db = await createDatabaseForTest('suite=functions/encoding-efficiency');
    resource = await db.createResource({
      name: 'efficiency_test',
      attributes: {
        id: 'string|required',
        content: 'string|required'
      }
    });
  });

  afterAll(async () => {
    if (db?.teardown) await db.teardown();
  });

  test('should demonstrate efficiency gains over pure base64', async () => {
    const testCases = [
      {
        name: 'ASCII only content',
        text: 'This is a simple ASCII text with no special characters at all.',
        expectedImprovement: true
      },
      {
        name: 'Portuguese text with accents',
        text: 'Olá! Estou testando a codificação com acentuação em português. Ação, emoção, coração.',
        expectedImprovement: true  
      },
      {
        name: 'Mixed European languages',
        text: 'José García from España, François Müller from Deutschland, and Paweł from Polska.',
        expectedImprovement: true
      },
      {
        name: 'Heavy emoji content',
        text: '🚀🌟😊💡🎉🌈✨🔥⚡💫',
        expectedImprovement: false // Base64 better for emoji-heavy
      },
      {
        name: 'Chinese text',
        text: '这是一个中文测试字符串，包含各种汉字。',
        expectedImprovement: false // Base64 better for CJK
      },
      {
        name: 'Mixed realistic content',
        text: 'User José María posted: "Great product! 👍" from São Paulo, Brasil',
        expectedImprovement: true // URL encoding better for mostly ASCII with some special
      }
    ];

    console.log('\n=== Encoding Efficiency Comparison ===\n');
    
    let totalOriginalSize = 0;
    let totalSmartSize = 0;
    let totalBase64Size = 0;

    for (const { name, text, expectedImprovement } of testCases) {
      // Calculate sizes
      const originalSize = Buffer.byteLength(text, 'utf8');
      const base64Size = Buffer.from(text, 'utf8').toString('base64').length;
      const smartInfo = calculateEncodedSize(text);
      
      totalOriginalSize += originalSize;
      totalBase64Size += base64Size;
      totalSmartSize += smartInfo.encoded;

      const base64Overhead = ((base64Size / originalSize) - 1) * 100;
      const smartOverhead = ((smartInfo.encoded / originalSize) - 1) * 100;
      const improvement = base64Overhead - smartOverhead;

      console.log(`\n${name}:`);
      console.log(`  Original: ${originalSize} bytes`);
      console.log(`  Base64: ${base64Size} bytes (+${base64Overhead.toFixed(1)}%)`);
      console.log(`  Smart (${smartInfo.encoding}): ${smartInfo.encoded} bytes (+${smartOverhead.toFixed(1)}%)`);
      console.log(`  Savings: ${improvement.toFixed(1)}% ${improvement > 0 ? '✅' : '❌'}`);

      // Test actual storage and retrieval
      await resource.insert({
        id: `test-${Date.now()}`,
        content: text
      });

      // Verify improvement matches expectation
      if (expectedImprovement) {
        expect(smartInfo.encoded).toBeLessThanOrEqual(base64Size);
      }
    }

    // Overall statistics
    console.log('\n=== Overall Statistics ===');
    console.log(`Total original size: ${totalOriginalSize} bytes`);
    console.log(`Total base64 size: ${totalBase64Size} bytes (+${((totalBase64Size/totalOriginalSize - 1) * 100).toFixed(1)}%)`);
    console.log(`Total smart encoding size: ${totalSmartSize} bytes (+${((totalSmartSize/totalOriginalSize - 1) * 100).toFixed(1)}%)`);
    console.log(`Overall improvement: ${((1 - totalSmartSize/totalBase64Size) * 100).toFixed(1)}% reduction`);

    // Smart encoding should be better overall for mixed content
    expect(totalSmartSize).toBeLessThan(totalBase64Size);
  });

  test('should handle edge cases efficiently', async () => {
    const edgeCases = [
      { id: 'empty', content: '' },
      { id: 'spaces', content: '   ' },
      { id: 'newlines', content: '\n\n\n' },
      { id: 'tabs', content: '\t\t\t' },
      { id: 'null-str', content: 'null' },
      { id: 'undefined-str', content: 'undefined' },
      { id: 'long-ascii', content: 'A'.repeat(1000) },
      { id: 'long-unicode', content: 'ção'.repeat(100) },
      { id: 'long-emoji', content: '🚀'.repeat(50) }
    ];

    for (const data of edgeCases) {
      const inserted = await resource.insert(data);
      const retrieved = await resource.get(data.id);
      expect(retrieved.content).toBe(data.content);
    }
  });

  test('should not break existing functionality', async () => {
    // Test that all existing special character tests still work
    const specialChars = {
      id: 'special-test',
      content: 'José María 中文 🚀 € ∞ ≠ אבג العربية ไทย Việt Nam'
    };

    await resource.insert(specialChars);
    const retrieved = await resource.get('special-test');
    
    expect(retrieved.content).toBe(specialChars.content);
    expect(retrieved.id).toBe(specialChars.id);
  });

  test('efficiency comparison table', () => {
    const samples = [
      'Hello World',                          // Pure ASCII
      'José María',                          // Latin with accents
      'Ação e emoção',                       // Portuguese
      '€100.50',                             // Currency symbol
      '🚀',                                  // Single emoji
      '中文',                                // Chinese
      'Mix: José 中 🚀'                      // Mixed content
    ];

    console.log('\n=== Encoding Efficiency Table ===');
    console.log('Text Sample            | Orig | B64  | Smart | Best Method');
    console.log('----------------------|------|------|-------|------------');

    samples.forEach(text => {
      const orig = Buffer.byteLength(text, 'utf8');
      const b64 = Buffer.from(text).toString('base64').length;
      const smart = calculateEncodedSize(text);
      const padded = text.padEnd(20);
      
      console.log(
        `${padded.substring(0, 20)} | ${String(orig).padStart(4)} | ${String(b64).padStart(4)} | ${String(smart.encoded).padStart(5)} | ${smart.encoding}`
      );
    });
  });
});