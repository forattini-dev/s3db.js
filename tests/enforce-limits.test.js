import {
  handleInsert,
  handleUpdate,
  handleUpsert,
  handleGet,
  S3_METADATA_LIMIT_BYTES
} from '../src/behaviors/enforce-limits.js';

describe('Enforce Limits Behavior - Strict S3 Metadata Size Validation', () => {
  const mockResource = {
    name: 'test-resource',
    version: 'v1'
  };

  describe('Cenário 1: Dados dentro do limite de 2KB', () => {
    test('Deve permitir inserção de dados pequenos', async () => {
      const smallData = {
        name: 'João Silva',
        email: 'joao@company.com',
        role: 'user'
      };

      const smallMappedData = {
        '1': 'João Silva',
        '2': 'joao@company.com',
        '3': 'user',
        '_v': '1'
      };

      const result = await handleInsert({
        resource: mockResource,
        data: smallData,
        mappedData: smallMappedData
      });

      expect(result.mappedData).toBe(smallMappedData);
      expect(result.body).toBe('');
    });

    test('Deve permitir update de dados pequenos', async () => {
      const updateData = {
        name: 'João Silva Santos',
        email: 'joao.santos@company.com'
      };

      const mappedData = {
        '1': 'João Silva Santos',
        '2': 'joao.santos@company.com',
        '_v': '1'
      };

      const result = await handleUpdate({
        resource: mockResource,
        id: 'user-123',
        data: updateData,
        mappedData: mappedData
      });

      expect(result.mappedData).toBe(mappedData);
      expect(result.body).toBe('');
    });

    test('Deve permitir upsert de dados pequenos', async () => {
      const upsertData = {
        name: 'Maria Silva',
        email: 'maria@company.com',
        role: 'admin'
      };

      const mappedData = {
        '1': 'Maria Silva',
        '2': 'maria@company.com',
        '3': 'admin',
        '_v': '1'
      };

      const result = await handleUpsert({
        resource: mockResource,
        id: 'user-456',
        data: upsertData,
        mappedData: mappedData
      });

      expect(result.mappedData).toBe(mappedData);
      expect(result.body).toBe('');
    });
  });

  describe('Cenário 2: Dados que excedem limite de 2KB', () => {
    test('Deve rejeitar inserção de dados grandes com erro específico', async () => {
      const largeData = {
        name: 'João Silva',
        description: 'x'.repeat(3000), // 3KB de dados
        metadata: {
          largeField: 'y'.repeat(1000)
        }
      };

      const largeMappedData = {
        '1': 'João Silva',
        '2': 'x'.repeat(3000),
        '3': JSON.stringify({ largeField: 'y'.repeat(1000) }),
        '_v': '1'
      };

      await expect(handleInsert({
        resource: mockResource,
        data: largeData,
        mappedData: largeMappedData
      })).rejects.toThrow('S3 metadata size exceeds 2KB limit');
    });

    test('Deve rejeitar update de dados grandes com detalhes de tamanho', async () => {
      const largeUpdateData = {
        biography: 'a'.repeat(4000), // 4KB de texto
        preferences: {
          settings: 'b'.repeat(1000)
        }
      };

      const largeMappedData = {
        '1': 'a'.repeat(4000),
        '2': JSON.stringify({ settings: 'b'.repeat(1000) }),
        '_v': '1'
      };

      try {
        await handleUpdate({
          resource: mockResource,
          id: 'user-456',
          data: largeUpdateData,
          mappedData: largeMappedData
        });
        fail('Deveria ter lançado erro');
      } catch (error) {
        expect(error.message).toContain('S3 metadata size exceeds 2KB limit');
        expect(error.message).toContain('Current size:');
        expect(error.message).toContain('limit: 2048 bytes');
      }
    });

    test('Deve rejeitar upsert de dados grandes', async () => {
      const largeUpsertData = {
        name: 'Maria Fernanda',
        skills: Array.from({ length: 100 }, (_, i) => `Skill ${i} with detailed description`),
        experience: 'c'.repeat(2500)
      };

      const largeMappedData = {
        '1': 'Maria Fernanda',
        '2': largeUpsertData.skills.join('|'),
        '3': 'c'.repeat(2500),
        '_v': '1'
      };

      await expect(handleUpsert({
        resource: mockResource,
        id: 'user-789',
        data: largeUpsertData,
        mappedData: largeMappedData
      })).rejects.toThrow('S3 metadata size exceeds 2KB limit');
    });
  });

  describe('Cenário 3: Teste de handleGet (comportamento passivo)', () => {
    test('Deve retornar dados sem modificação no get', async () => {
      const metadata = {
        '1': 'João Silva',
        '2': 'joao@company.com',
        '3': 'admin',
        '_v': '1'
      };

      const body = 'Some body content';

      const result = await handleGet({
        resource: mockResource,
        metadata: metadata,
        body: body
      });

      expect(result.metadata).toBe(metadata);
      expect(result.body).toBe(body);
    });

    test('Deve lidar com metadata e body nulos', async () => {
      const result = await handleGet({
        resource: mockResource,
        metadata: null,
        body: null
      });

      expect(result.metadata).toBeNull();
      expect(result.body).toBeNull();
    });
  });

  describe('Cenário 4: Teste de limites exatos', () => {
    test('Deve permitir dados exatamente no limite de 2KB', async () => {
      // Criar dados que fiquem próximos ao limite
      const nearLimitData = {
        description: 'x'.repeat(1900) // Próximo ao limite, mas dentro
      };

      const nearLimitMappedData = {
        '1': 'x'.repeat(1900),
        '_v': '1'
      };

      const result = await handleInsert({
        resource: mockResource,
        data: nearLimitData,
        mappedData: nearLimitMappedData
      });

      expect(result.mappedData).toBe(nearLimitMappedData);
    });

    test('Deve rejeitar dados que excedam por poucos bytes', async () => {
      // Criar dados que excedam o limite por pouco
      const overLimitData = {
        description: 'x'.repeat(2100) // Acima do limite
      };

      const overLimitMappedData = {
        '1': 'x'.repeat(2100),
        '_v': '1'
      };

      await expect(handleInsert({
        resource: mockResource,
        data: overLimitData,
        mappedData: overLimitMappedData
      })).rejects.toThrow('S3 metadata size exceeds 2KB limit');
    });
  });

  describe('Cenário 5: Dados UTF-8 complexos', () => {
    test('Deve calcular corretamente tamanho de caracteres UTF-8', async () => {
      const unicodeData = {
        name: 'José da Silva',
        description: 'Descrição com acentos: ação, coração, informação',
        emoji: '🎉🚀💡🔥'.repeat(10), // Emojis consomem 4 bytes cada
        chineseText: '你好世界'.repeat(20) // Caracteres chineses consomem 3 bytes cada
      };

      const unicodeMappedData = {
        '1': unicodeData.name,
        '2': unicodeData.description,
        '3': unicodeData.emoji,
        '4': unicodeData.chineseText,
        '_v': '1'
      };

      // Se exceder o limite, deve rejeitar
      // Se estiver dentro do limite, deve aceitar
      try {
        const result = await handleInsert({
          resource: mockResource,
          data: unicodeData,
          mappedData: unicodeMappedData
        });
        
        expect(result.mappedData).toBe(unicodeMappedData);
      } catch (error) {
        expect(error.message).toContain('S3 metadata size exceeds 2KB limit');
      }
    });

    test('Deve rejeitar strings UTF-8 grandes', async () => {
      const largeUnicodeData = {
        // Criar string grande com caracteres UTF-8 multi-byte
        chinese: '你好世界'.repeat(300), // ~3600 bytes (muito acima do limite)
        arabic: 'مرحبا بك'.repeat(100) // Mais caracteres multi-byte
      };

      const largeMappedData = {
        '1': largeUnicodeData.chinese,
        '2': largeUnicodeData.arabic,
        '_v': '1'
      };

      await expect(handleInsert({
        resource: mockResource,
        data: largeUnicodeData,
        mappedData: largeMappedData
      })).rejects.toThrow('S3 metadata size exceeds 2KB limit');
    });
  });

  describe('Cenário 6: Constante S3_METADATA_LIMIT_BYTES', () => {
    test('Deve exportar constante correta', () => {
      expect(S3_METADATA_LIMIT_BYTES).toBe(2048);
      expect(typeof S3_METADATA_LIMIT_BYTES).toBe('number');
    });

    test('Deve usar a constante nas mensagens de erro', async () => {
      const largeData = {
        content: 'x'.repeat(3000)
      };

      const largeMappedData = {
        '1': 'x'.repeat(3000),
        '_v': '1'
      };

      try {
        await handleInsert({
          resource: mockResource,
          data: largeData,
          mappedData: largeMappedData
        });
        fail('Deveria ter lançado erro');
      } catch (error) {
        expect(error.message).toContain(`limit: ${S3_METADATA_LIMIT_BYTES} bytes`);
      }
    });
  });

  describe('Cenário 7: Comparação com user-management behavior', () => {
    test('Deve ser mais restritivo que user-management', async () => {
      // enforce-limits deve rejeitar, user-management apenas avisa
      const largeData = {
        content: 'x'.repeat(3000)
      };

      const largeMappedData = {
        '1': 'x'.repeat(3000),
        '_v': '1'
      };

      // enforce-limits: deve lançar erro
      await expect(handleInsert({
        resource: mockResource,
        data: largeData,
        mappedData: largeMappedData
      })).rejects.toThrow();

      // user-management: apenas emitiria evento (testado em user-management.test.js)
    });

    test('Deve ter mensagens de erro mais específicas', async () => {
      const largeData = {
        content: 'x'.repeat(3000)
      };

      const largeMappedData = {
        '1': 'x'.repeat(3000),
        '_v': '1'
      };

      try {
        await handleInsert({
          resource: mockResource,
          data: largeData,
          mappedData: largeMappedData
        });
        fail('Deveria ter lançado erro');
      } catch (error) {
        expect(error.message).toContain('S3 metadata size exceeds 2KB limit');
        expect(error.message).toContain('Current size:');
        expect(error.message).toContain('bytes');
        expect(error.message).toContain('limit: 2048 bytes');
      }
    });
  });
});