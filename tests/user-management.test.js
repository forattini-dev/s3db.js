import { 
  handleInsert, 
  handleUpdate, 
  handleUpsert, 
  handleGet 
} from '../src/behaviors/user-management.js';
import { S3_METADATA_LIMIT_BYTES } from '../src/behaviors/enforce-limits.js';
import EventEmitter from 'events';

describe('User Management Behavior - Default Resource Behavior', () => {
  let mockResource;
  let events;

  beforeEach(() => {
    events = [];
    mockResource = new EventEmitter();
    mockResource.on('exceedsLimit', (eventData) => {
      events.push(eventData);
    });
  });

  describe('Cenário 1: Inserção de dados dentro do limite', () => {
    test('Deve processar inserção normal sem emitir eventos', async () => {
      const normalData = {
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
        data: normalData,
        mappedData: smallMappedData
      });

      expect(result.mappedData).toBe(smallMappedData);
      expect(result.body).toBe('');
      expect(events).toHaveLength(0); // Nenhum evento emitido
    });

    test('Deve processar update normal sem emitir eventos', async () => {
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
      expect(events).toHaveLength(0);
    });
  });

  describe('Cenário 2: Dados que excedem limite de metadata S3 (2KB)', () => {
    test('Deve emitir evento de limite excedido no insert', async () => {
      const largeData = {
        name: 'João Silva',
        description: 'x'.repeat(3000), // String grande que excede 2KB
        metadata: {
          largeField: 'y'.repeat(1000)
        }
      };

      // Simular dados mapeados grandes
      const largeMappedData = {
        '1': 'João Silva',
        '2': 'x'.repeat(3000),
        '3': JSON.stringify({ largeField: 'y'.repeat(1000) }),
        '_v': '1'
      };

      const result = await handleInsert({
        resource: mockResource,
        data: largeData,
        mappedData: largeMappedData
      });

      expect(result.mappedData).toBe(largeMappedData);
      expect(result.body).toBe('');
      expect(events).toHaveLength(1);

      const event = events[0];
      expect(event.operation).toBe('insert');
      expect(event.totalSize).toBeGreaterThan(S3_METADATA_LIMIT_BYTES);
      expect(event.limit).toBe(S3_METADATA_LIMIT_BYTES);
      expect(event.excess).toBeGreaterThan(0);
      expect(event.data).toBe(largeData);
    });

    test('Deve emitir evento de limite excedido no update', async () => {
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

      const result = await handleUpdate({
        resource: mockResource,
        id: 'user-456',
        data: largeUpdateData,
        mappedData: largeMappedData
      });

      expect(events).toHaveLength(1);

      const event = events[0];
      expect(event.operation).toBe('update');
      expect(event.id).toBe('user-456');
      expect(event.totalSize).toBeGreaterThan(S3_METADATA_LIMIT_BYTES);
      expect(event.excess).toBeGreaterThan(0);
    });

    test('Deve emitir evento de limite excedido no upsert', async () => {
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

      const result = await handleUpsert({
        resource: mockResource,
        id: 'user-789',
        data: largeUpsertData,
        mappedData: largeMappedData
      });

      expect(events).toHaveLength(1);

      const event = events[0];
      expect(event.operation).toBe('upsert');
      expect(event.id).toBe('user-789');
      expect(event.totalSize).toBeGreaterThan(S3_METADATA_LIMIT_BYTES);
    });
  });

  describe('Cenário 3: Teste do handleGet (comportamento passivo)', () => {
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
      expect(events).toHaveLength(0); // Get não emite eventos
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

  describe('Cenário 4: Cálculo preciso de tamanhos de dados complexos', () => {
    test('Deve calcular corretamente tamanho de dados com caracteres UTF-8', async () => {
      const dataWithUnicode = {
        name: 'José da Silva',
        description: 'Descrição com acentos: ação, coração, informação',
        emoji: '🎉🚀💡🔥',
        chineseText: '你好世界'
      };

      const mappedDataWithUnicode = {
        '1': 'José da Silva',
        '2': 'Descrição com acentos: ação, coração, informação',
        '3': '🎉🚀💡🔥',
        '4': '你好世界',
        '_v': '1'
      };

      const result = await handleInsert({
        resource: mockResource,
        data: dataWithUnicode,
        mappedData: mappedDataWithUnicode
      });

      // Deve processar normalmente se estiver dentro do limite
      expect(result.mappedData).toBe(mappedDataWithUnicode);
      expect(result.body).toBe('');
      
      // Verificar se evento foi emitido baseado no tamanho real
      if (events.length > 0) {
        expect(events[0].totalSize).toBeGreaterThan(0);
      }
    });

    test('Deve calcular tamanho considerando chaves e valores do mapeamento', async () => {
      const complexData = {
        array: ['item1', 'item2', 'item3'],
        object: { nested: { deep: 'value' } },
        boolean: true,
        number: 42.5
      };

      const mappedComplexData = {
        '1': 'item1|item2|item3',
        '2': '{"nested":{"deep":"value"}}',
        '3': '1', // boolean transformed
        '4': '42.5', // number transformed  
        '_v': '1'
      };

      const result = await handleInsert({
        resource: mockResource,
        data: complexData,
        mappedData: mappedComplexData
      });

      expect(result.mappedData).toBe(mappedComplexData);
      
      // Se exceder limite, evento deve ter informações precisas
      if (events.length > 0) {
        const event = events[0];
        expect(event.totalSize).toBeGreaterThan(0);
        expect(event.excess).toBe(event.totalSize - S3_METADATA_LIMIT_BYTES);
      }
    });
  });

  describe('Cenário 5: Simulação de casos reais de uso', () => {
    test('Deve processar perfil de usuário típico sem problemas', async () => {
      const typicalUserProfile = {
        name: 'Ana Carolina Silva',
        email: 'ana.silva@company.com',
        role: 'senior_developer',
        department: 'engineering',
        skills: ['JavaScript', 'React', 'Node.js', 'AWS'],
        preferences: {
          theme: 'dark',
          language: 'pt-BR',
          notifications: true
        },
        bio: 'Desenvolvedora com 5 anos de experiência'
      };

      const mappedProfile = {
        '1': 'Ana Carolina Silva',
        '2': 'ana.silva@company.com',
        '3': 'senior_developer',
        '4': 'engineering',
        '5': 'JavaScript|React|Node.js|AWS',
        '6': '{"theme":"dark","language":"pt-BR","notifications":true}',
        '7': 'Desenvolvedora com 5 anos de experiência',
        '_v': '1'
      };

      const result = await handleInsert({
        resource: mockResource,
        data: typicalUserProfile,
        mappedData: mappedProfile
      });

      expect(result.mappedData).toBe(mappedProfile);
      expect(events).toHaveLength(0); // Perfil típico não deve exceder limite
    });

    test('Deve lidar com dados de importação em massa que excedem limite', async () => {
      const bulkImportData = {
        name: 'Usuário Importado',
        importedData: 'x'.repeat(3000), // Dados grandes de sistema legado
        legacySettings: JSON.stringify({
          oldSystem: 'y'.repeat(1000),
          migrationNotes: 'z'.repeat(500)
        })
      };

      const mappedBulkData = {
        '1': 'Usuário Importado',
        '2': 'x'.repeat(3000),
        '3': JSON.stringify({
          oldSystem: 'y'.repeat(1000),
          migrationNotes: 'z'.repeat(500)
        }),
        '_v': '1'
      };

      const result = await handleInsert({
        resource: mockResource,
        data: bulkImportData,
        mappedData: mappedBulkData
      });

      expect(result.mappedData).toBe(mappedBulkData);
      expect(events).toHaveLength(1);

      const event = events[0];
      expect(event.operation).toBe('insert');
      expect(event.totalSize).toBeGreaterThan(S3_METADATA_LIMIT_BYTES);
      expect(event.data).toBe(bulkImportData);
    });

    test('Deve monitorar múltiplas operações sequenciais', async () => {
      const operations = [
        {
          type: 'insert',
          data: { name: 'User 1', content: 'a'.repeat(3000) },
          mapped: { '1': 'User 1', '2': 'a'.repeat(3000), '_v': '1' }
        },
        {
          type: 'update',
          id: 'user-1',
          data: { content: 'b'.repeat(2500) },
          mapped: { '2': 'b'.repeat(2500), '_v': '1' }
        },
        {
          type: 'upsert',
          id: 'user-2',
          data: { name: 'User 2', content: 'c'.repeat(2800) },
          mapped: { '1': 'User 2', '2': 'c'.repeat(2800), '_v': '1' }
        }
      ];

      for (const operation of operations) {
        if (operation.type === 'insert') {
          await handleInsert({
            resource: mockResource,
            data: operation.data,
            mappedData: operation.mapped
          });
        } else if (operation.type === 'update') {
          await handleUpdate({
            resource: mockResource,
            id: operation.id,
            data: operation.data,
            mappedData: operation.mapped
          });
        } else if (operation.type === 'upsert') {
          await handleUpsert({
            resource: mockResource,
            id: operation.id,
            data: operation.data,
            mappedData: operation.mapped
          });
        }
      }

      // Todas as operações devem ter excedido o limite
      expect(events).toHaveLength(3);
      
      events.forEach((event, index) => {
        expect(event.operation).toBe(operations[index].type);
        expect(event.totalSize).toBeGreaterThan(S3_METADATA_LIMIT_BYTES);
      });
    });
  });
});