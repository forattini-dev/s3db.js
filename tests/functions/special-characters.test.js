import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';

describe('Special Characters Encoding Tests', () => {
  let db;
  let resource;

  beforeAll(async () => {
    db = await createDatabaseForTest('special-chars');
    resource = await db.createResource({
      name: 'test_special_chars',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        description: 'string|optional',
        location: 'string|optional',
        notes: 'string|optional'
      },
      behavior: 'user-managed'
    });
  });

  afterAll(async () => {
    if (db?.teardown) await db.teardown();
  });

  test('should preserve Portuguese characters', async () => {
    const testData = {
      id: 'test-pt',
      name: 'João da Silva',
      description: 'Descrição com acentos: ação, coração, não',
      location: 'São Paulo, Brasil',
      notes: 'Notas com ç, ã, õ, á, é, í, ó, ú'
    };

    const inserted = await resource.insert(testData);
    expect(inserted.name).toBe(testData.name);
    expect(inserted.description).toBe(testData.description);

    const retrieved = await resource.get('test-pt');
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
    expect(retrieved.notes).toBe(testData.notes);
  });

  test('should preserve Spanish characters', async () => {
    const testData = {
      id: 'test-es',
      name: 'José María Rodríguez',
      description: 'Descripción en español con ñ, á, é, í, ó, ú',
      location: 'Barcelona, España'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-es');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
  });

  test('should preserve French characters', async () => {
    const testData = {
      id: 'test-fr',
      name: 'François Müller',
      description: 'Caractères français: é, è, ê, ë, à, ù, ç, œ',
      location: 'Paris, France'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-fr');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
  });

  test('should preserve German characters', async () => {
    const testData = {
      id: 'test-de',
      name: 'Jürgen Müller',
      description: 'Deutsche Zeichen: ä, ö, ü, ß',
      location: 'München, Deutschland'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-de');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
  });

  test('should preserve Asian characters', async () => {
    const testData = {
      id: 'test-asian',
      name: '田中太郎',
      description: '中国语言测试: 你好世界',
      location: 'Tokyo, 日本'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-asian');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
  });

  test('should preserve emojis and symbols', async () => {
    const testData = {
      id: 'test-emoji',
      name: 'Test 🚀 User',
      description: 'Emojis: 😀 🎉 💻 🌟 ❤️ and symbols: © ® ™ € £ ¥',
      location: 'Global 🌍'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-emoji');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
  });

  test('should preserve mixed Unicode characters', async () => {
    const testData = {
      id: 'test-mixed',
      name: 'Vovôs Bressan',
      description: 'Mixed: café 🍵, naïve résumé, Ørsted company',
      location: 'Zürich, Schweiz 🇨🇭'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-mixed');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
  });

  test('should handle ASCII characters normally', async () => {
    const testData = {
      id: 'test-ascii',
      name: 'Regular ASCII Name',
      description: 'Regular description with no special characters',
      location: 'New York, USA'
    };

    const inserted = await resource.insert(testData);
    const retrieved = await resource.get('test-ascii');
    
    expect(retrieved.name).toBe(testData.name);
    expect(retrieved.description).toBe(testData.description);
    expect(retrieved.location).toBe(testData.location);
  });

  test('should preserve special characters in updates', async () => {
    const initialData = {
      id: 'test-update',
      name: 'Initial Name',
      description: 'Initial description'
    };

    await resource.insert(initialData);

    const updateData = {
      name: 'José María Fernández',
      description: 'Atualização com açentôs e ñ'
    };

    const updated = await resource.update('test-update', updateData);
    expect(updated.name).toBe(updateData.name);
    expect(updated.description).toBe(updateData.description);

    const retrieved = await resource.get('test-update');
    expect(retrieved.name).toBe(updateData.name);
    expect(retrieved.description).toBe(updateData.description);
  });
}); 