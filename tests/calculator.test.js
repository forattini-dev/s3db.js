import {
  calculateUTF8Bytes,
  calculateAttributeNamesSize,
  transformValue,
  calculateAttributeSizes,
  calculateTotalSize,
  getSizeBreakdown
} from '../src/concerns/calculator.js';

describe('Calculator Functions - Byte Size Calculations', () => {
  describe('calculateUTF8Bytes', () => {
    test('Deve calcular bytes corretamente para caracteres ASCII', () => {
      expect(calculateUTF8Bytes('hello')).toBe(5);
      expect(calculateUTF8Bytes('a')).toBe(1);
      expect(calculateUTF8Bytes('')).toBe(0);
      expect(calculateUTF8Bytes('123456789')).toBe(9);
    });

    test('Deve calcular bytes corretamente para caracteres acentuados', () => {
      expect(calculateUTF8Bytes('ação')).toBe(5); // 'a' + 'ç' (2 bytes) + 'ã' (2 bytes) + 'o'
      expect(calculateUTF8Bytes('José')).toBe(5); // 'J' + 'o' + 's' + 'é' (2 bytes)
      expect(calculateUTF8Bytes('café')).toBe(5); // 'c' + 'a' + 'f' + 'é' (2 bytes)
    });

    test('Deve calcular bytes corretamente para emojis e caracteres especiais', () => {
      expect(calculateUTF8Bytes('😀')).toBe(4); // Emoji usa 4 bytes
      expect(calculateUTF8Bytes('🐕')).toBe(4); // Dog emoji
      expect(calculateUTF8Bytes('🇧🇷')).toBe(8); // Flag emoji (2 emojis combinados)
    });

    test('Deve converter números e outros tipos para string antes de calcular', () => {
      expect(calculateUTF8Bytes(123)).toBe(3);
      expect(calculateUTF8Bytes(true)).toBe(4); // "true"
      expect(calculateUTF8Bytes(false)).toBe(5); // "false"
    });
  });

  describe('transformValue', () => {
    test('Deve transformar valores nulos e undefined corretamente', () => {
      expect(transformValue(null)).toBe('');
      expect(transformValue(undefined)).toBe('');
    });

    test('Deve transformar booleanos em 0 e 1', () => {
      expect(transformValue(true)).toBe('1');
      expect(transformValue(false)).toBe('0');
    });

    test('Deve transformar números em strings', () => {
      expect(transformValue(42)).toBe('42');
      expect(transformValue(3.14159)).toBe('3.14159');
      expect(transformValue(-100)).toBe('-100');
    });

    test('Deve manter strings como estão', () => {
      expect(transformValue('hello world')).toBe('hello world');
      expect(transformValue('')).toBe('');
    });

    test('Deve transformar arrays corretamente', () => {
      expect(transformValue([])).toBe('[]');
      expect(transformValue([1, 2, 3])).toBe('1|2|3');
      expect(transformValue(['a', 'b', 'c'])).toBe('a|b|c');
      expect(transformValue([true, false])).toBe('true|false');
    });

    test('Deve transformar objetos em JSON', () => {
      expect(transformValue({ name: 'John', age: 30 })).toBe('{"name":"John","age":30}');
      expect(transformValue({})).toBe('{}');
    });
  });

  describe('Cenário Real: Calculando tamanhos de objetos mapeados', () => {
    const sampleMappedObject = {
      '1': 'João Silva', // name
      '2': 'joao@email.com', // email
      '3': '30', // age
      '4': '1', // isActive (boolean true)
      '5': 'admin|user', // roles array
      '6': '{"city":"São Paulo","country":"Brazil"}', // address object
      '_v': '1' // version field
    };

    test('Deve calcular o tamanho dos nomes de atributos (chaves)', () => {
      const size = calculateAttributeNamesSize(sampleMappedObject);
      // Keys: '1', '2', '3', '4', '5', '6' = 6 bytes (version field '_v' é ignorado)
      expect(size).toBe(6);
    });

    test('Deve calcular o tamanho de cada atributo individualmente', () => {
      const sizes = calculateAttributeSizes(sampleMappedObject);
      
      expect(sizes['1']).toBe(calculateUTF8Bytes('João Silva')); // 11 bytes (ã = 2 bytes)
      expect(sizes['2']).toBe(calculateUTF8Bytes('joao@email.com')); // 14 bytes
      expect(sizes['3']).toBe(2); // '30'
      expect(sizes['4']).toBe(1); // '1'
      expect(sizes['5']).toBe(10); // 'admin|user'
      expect(sizes['6']).toBe(calculateUTF8Bytes('{"city":"São Paulo","country":"Brazil"}')); // JSON with ã
      expect(sizes['_v']).toBe(1); // '1'
    });

    test('Deve calcular o tamanho total do objeto', () => {
      const totalSize = calculateTotalSize(sampleMappedObject);
      const expectedValueSize = 
        calculateUTF8Bytes('João Silva') + // 11
        calculateUTF8Bytes('joao@email.com') + // 14
        2 + // '30'
        1 + // '1'
        10 + // 'admin|user'
        calculateUTF8Bytes('{"city":"São Paulo","country":"Brazil"}') + // JSON
        1; // '_v'
      const expectedNamesSize = 6; // attribute names (excluding _v)
      
      expect(totalSize).toBe(expectedValueSize + expectedNamesSize);
    });

    test('Deve fornecer breakdown detalhado dos tamanhos', () => {
      const breakdown = getSizeBreakdown(sampleMappedObject);
      
      expect(breakdown).toHaveProperty('total');
      expect(breakdown).toHaveProperty('valueSizes');
      expect(breakdown).toHaveProperty('namesSize');
      expect(breakdown).toHaveProperty('valueTotal');
      expect(breakdown).toHaveProperty('breakdown');
      expect(breakdown).toHaveProperty('detailedBreakdown');
      
      // Verificar que o breakdown está ordenado por tamanho (maior primeiro)
      const sortedBreakdown = breakdown.breakdown;
      expect(sortedBreakdown).toBeInstanceOf(Array);
      
      for (let i = 0; i < sortedBreakdown.length - 1; i++) {
        expect(sortedBreakdown[i].size).toBeGreaterThanOrEqual(sortedBreakdown[i + 1].size);
      }
      
      // Verificar que cada item tem percentage
      sortedBreakdown.forEach(item => {
        expect(item).toHaveProperty('attribute');
        expect(item).toHaveProperty('size');
        expect(item).toHaveProperty('percentage');
        expect(item.percentage).toMatch(/^\d+\.\d{2}%$/);
      });
    });
  });

  describe('Cenário de Stress: Objetos grandes com dados multilíngues', () => {
    const largeMappedObject = {
      '1': 'Uma descrição muito longa em português com acentos: ação, coração, atenção, informação',
      '2': 'A very long description in English with special characters: @#$%^&*()',
      '3': '非常长的中文描述，包含很多汉字字符', // Chinese text
      '4': 'Очень длинное описание на русском языке с кириллицей', // Russian text
      '5': 'تصف هذه العبارة شيئًا باللغة العربية', // Arabic text
      '6': '🐕🐶🦴🏠🌳🌞🌙⭐', // Multiple emojis
      '7': JSON.stringify({
        users: [
          { name: 'José', email: 'jose@test.com', active: true },
          { name: 'María', email: 'maria@test.com', active: false },
          { name: 'François', email: 'francois@test.com', active: true }
        ],
        metadata: {
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-02T12:30:45Z',
          tags: ['important', 'multilingual', 'test']
        }
      }),
      '_v': '2'
    };

    test('Deve calcular corretamente tamanhos de textos multilíngues', () => {
      const breakdown = getSizeBreakdown(largeMappedObject);
      
      expect(breakdown.total).toBeGreaterThan(500); // Objeto grande
      expect(breakdown.breakdown.length).toBe(8); // 7 attributes + _v
      
      // O campo com JSON deve ser um dos maiores
      const jsonField = breakdown.breakdown.find(item => item.attribute === '7');
      expect(jsonField).toBeDefined();
      expect(jsonField.size).toBeGreaterThan(200);
    });

    test('Deve identificar o campo que mais consome espaço', () => {
      const breakdown = getSizeBreakdown(largeMappedObject);
      const largestField = breakdown.breakdown[0]; // First item is largest
      
      // Verificar que o maior campo tem uma porcentagem significativa
      const percentage = parseFloat(largestField.percentage.replace('%', ''));
      expect(percentage).toBeGreaterThan(10); // Pelo menos 10% do total
    });
  });

  describe('Edge Cases', () => {
    test('Deve lidar com objeto vazio', () => {
      const emptyObject = {};
      const totalSize = calculateTotalSize(emptyObject);
      expect(totalSize).toBe(0);
      
      const breakdown = getSizeBreakdown(emptyObject);
      expect(breakdown.total).toBe(0);
      expect(breakdown.breakdown).toHaveLength(0);
    });

    test('Deve lidar com valores extremos', () => {
      const extremeObject = {
        '1': '', // Empty string
        '2': ' ', // Single space
        '3': 'a'.repeat(1000), // Very long string
        '4': '0', // Zero as string
        '5': Number.MAX_SAFE_INTEGER.toString(),
        '_v': '1'
      };

      const breakdown = getSizeBreakdown(extremeObject);
      expect(breakdown.total).toBeGreaterThan(1000);
      
      // Campo com string repetida deve ser o maior
      const largestField = breakdown.breakdown[0];
      expect(largestField.size).toBe(1000); // 'a' repeated 1000 times
    });

    test('Deve tratar arrays e objetos aninhados complexos', () => {
      const complexObject = {
        '1': [1, [2, [3, 4]], 5],
        '2': { a: { b: { c: 'deep' } } },
        '3': [{ name: 'Item 1' }, { name: 'Item 2' }],
        '_v': '1'
      };

      const sizes = calculateAttributeSizes(complexObject);
      
      // Array aninhado deve ser convertido usando join
      expect(sizes['1']).toBeGreaterThan(5);
      
      // Objeto aninhado deve ser JSON stringified
      expect(sizes['2']).toBeGreaterThan(10);
      
      // Array de objetos deve ser JSON stringified
      expect(sizes['3']).toBeGreaterThan(20);
    });
  });
});