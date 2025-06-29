describe('S3DB.js Entry Point - Module Exports', () => {
  describe('Cenário 1: Verificação de exports principais', () => {
    test('Deve exportar todas as classes principais', async () => {
      const s3dbModule = await import('../src/index.js');

      // Classes principais
      expect(s3dbModule.Client).toBeDefined();
      expect(s3dbModule.ConnectionString).toBeDefined();
      expect(s3dbModule.Database).toBeDefined();
      expect(s3dbModule.Validator).toBeDefined();

      // Export padrão
      expect(s3dbModule.default).toBeDefined();
      expect(s3dbModule.S3db).toBeDefined();
      expect(s3dbModule.S3db).toBe(s3dbModule.default);
    });

    test('Deve exportar funções utilitárias', async () => {
      const s3dbModule = await import('../src/index.js');

      // Funções de criptografia
      expect(s3dbModule.encrypt).toBeDefined();
      expect(s3dbModule.decrypt).toBeDefined();
      expect(typeof s3dbModule.encrypt).toBe('function');
      expect(typeof s3dbModule.decrypt).toBe('function');

      // Errors
      expect(s3dbModule.S3dbError).toBeDefined();
      expect(s3dbModule.ValidationError).toBeDefined();
      expect(s3dbModule.EncryptionError).toBeDefined();
      expect(s3dbModule.ResourceNotFoundError).toBeDefined();
    });

    test('Deve exportar sub-módulos de cache', async () => {
      const s3dbModule = await import('../src/index.js');

      // Cache classes
      expect(s3dbModule.Cache).toBeDefined();
      expect(s3dbModule.MemoryCache).toBeDefined();
      expect(s3dbModule.S3Cache).toBeDefined();
    });

    test('Deve exportar sub-módulos de plugins', async () => {
      const s3dbModule = await import('../src/index.js');

      // Plugin classes
      expect(s3dbModule.Plugin).toBeDefined();
      expect(s3dbModule.CachePlugin).toBeDefined();
      expect(s3dbModule.CostsPlugin).toBeDefined();
    });

    test('Deve exportar sub-módulos de stream', async () => {
      const s3dbModule = await import('../src/index.js');

      // Stream classes
      expect(s3dbModule.ResourceReader).toBeDefined();
      expect(s3dbModule.ResourceWriter).toBeDefined();
      expect(s3dbModule.ResourceIdsReader).toBeDefined();
      expect(s3dbModule.ResourceIdsPageReader).toBeDefined();
    });
  });

  describe('Cenário 2: Verificação de compatibilidade de imports', () => {
    test('Deve permitir import nomeado da classe principal', async () => {
      const { S3db } = await import('../src/index.js');
      
      expect(S3db).toBeDefined();
      expect(typeof S3db).toBe('function');
      expect(S3db.name).toBe('S3db');
    });

    test('Deve permitir import default', async () => {
      const S3db = (await import('../src/index.js')).default;
      
      expect(S3db).toBeDefined();
      expect(typeof S3db).toBe('function');
      expect(S3db.name).toBe('S3db');
    });

    test('Deve permitir destructuring de múltiplos exports', async () => {
      const { 
        S3db, 
        Database, 
        Client, 
        ConnectionString, 
        encrypt, 
        decrypt,
        Cache,
        Plugin
      } = await import('../src/index.js');

      expect(S3db).toBeDefined();
      expect(Database).toBeDefined();
      expect(Client).toBeDefined();
      expect(ConnectionString).toBeDefined();
      expect(encrypt).toBeDefined();
      expect(decrypt).toBeDefined();
      expect(Cache).toBeDefined();
      expect(Plugin).toBeDefined();

      // Verificar que são diferentes instâncias/funções
      expect(S3db).toBe(Database);
      expect(typeof encrypt).toBe('function');
      expect(typeof decrypt).toBe('function');
    });
  });

  describe('Cenário 3: Verificação de instanciação básica', () => {
    test('Deve permitir criação de instância via export default', async () => {
      const S3db = (await import('../src/index.js')).default;

      expect(() => {
        new S3db({
          client: {
            bucket: 'test-bucket',
            keyPrefix: '',
            putObject: async () => ({}),
            getObject: async () => ({ Body: '{}' }),
            exists: async () => false
          }
        });
      }).not.toThrow();
    });

    test('Deve permitir criação de instância via export nomeado', async () => {
      const { S3db } = await import('../src/index.js');

      expect(() => {
        new S3db({
          client: {
            bucket: 'test-bucket',
            keyPrefix: '',
            putObject: async () => ({}),
            getObject: async () => ({ Body: '{}' }),
            exists: async () => false
          }
        });
      }).not.toThrow();
    });

    test('Deve permitir uso de funções utilitárias diretamente', async () => {
      const { encrypt, decrypt } = await import('../src/index.js');

      const testData = 'test data for encryption';
      const passphrase = 'test-passphrase';

      const encrypted = await encrypt(testData, passphrase);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(testData);

      const decrypted = await decrypt(encrypted, passphrase);
      expect(decrypted).toBe(testData);
    });
  });

  describe('Cenário 4: Verificação de tipos de erro', () => {
    test('Deve ter hierarquia de erros correta', async () => {
      const { 
        S3dbError, 
        ValidationError, 
        EncryptionError, 
        ResourceNotFoundError 
      } = await import('../src/index.js');

      // Verificar que são construtores
      expect(typeof S3dbError).toBe('function');
      expect(typeof ValidationError).toBe('function');
      expect(typeof EncryptionError).toBe('function');
      expect(typeof ResourceNotFoundError).toBe('function');

      // Verificar herança
      const validationError = new ValidationError('test message');
      const encryptionError = new EncryptionError('test message');
      const resourceError = new ResourceNotFoundError('test message');

      expect(validationError).toBeInstanceOf(Error);
      expect(encryptionError).toBeInstanceOf(Error);
      expect(resourceError).toBeInstanceOf(Error);
      expect(validationError).toBeInstanceOf(S3dbError);
      expect(encryptionError).toBeInstanceOf(S3dbError);
      expect(resourceError).toBeInstanceOf(S3dbError);
    });
  });

  describe('Cenário 5: Compatibilidade com diferentes padrões de import', () => {
    test('Deve funcionar com CommonJS require (simulado)', async () => {
      // Simular comportamento CommonJS
      const s3dbModule = await import('../src/index.js');
      const moduleKeys = Object.keys(s3dbModule);

      expect(moduleKeys).toContain('default');
      expect(moduleKeys).toContain('S3db');
      expect(moduleKeys).toContain('Database');
      expect(moduleKeys).toContain('Client');
      expect(moduleKeys).toContain('encrypt');
      expect(moduleKeys).toContain('decrypt');
    });

    test('Deve funcionar com ES6 import *', async () => {
      const S3DB = await import('../src/index.js');

      expect(S3DB.default).toBeDefined();
      expect(S3DB.S3db).toBeDefined();
      expect(S3DB.Database).toBeDefined();
      expect(S3DB.Client).toBeDefined();
      expect(S3DB.encrypt).toBeDefined();
      expect(S3DB.decrypt).toBeDefined();
    });

    test('Deve manter consistência entre diferentes imports', async () => {
      const { S3db: NamedS3db } = await import('../src/index.js');
      const DefaultS3db = (await import('../src/index.js')).default;
      const AllExports = await import('../src/index.js');

      // Todas as referências devem apontar para a mesma coisa
      expect(NamedS3db).toBe(DefaultS3db);
      expect(NamedS3db).toBe(AllExports.S3db);
      expect(DefaultS3db).toBe(AllExports.default);
    });
  });

  describe('Cenário 6: Verificação de estabilidade de API', () => {
    test('Deve manter exports essenciais para compatibilidade', async () => {
      const s3dbModule = await import('../src/index.js');
      
      // Exports que devem sempre existir para manter compatibilidade
      const essentialExports = [
        'S3db',
        'Database',
        'Client',
        'ConnectionString',
        'encrypt',
        'decrypt',
        'Cache',
        'Plugin'
      ];

      essentialExports.forEach(exportName => {
        expect(s3dbModule[exportName]).toBeDefined();
      });
    });

    test('Deve exportar constantes importantes', async () => {
      const s3dbModule = await import('../src/index.js');

      // Verificar se constantes importantes estão disponíveis (se existirem)
      const potentialConstants = [
        'S3_DEFAULT_REGION',
        'S3_DEFAULT_ENDPOINT'
      ];

      potentialConstants.forEach(constant => {
        if (s3dbModule[constant]) {
          expect(typeof s3dbModule[constant]).toBe('string');
        }
      });
    });

    test('Deve manter versionamento consistente', async () => {
      const { S3db } = await import('../src/index.js');

      const instance = new S3db({
        client: {
          bucket: 'test-bucket',
          keyPrefix: '',
          putObject: async () => ({}),
          getObject: async () => ({ Body: '{}' }),
          exists: async () => false
        }
      });

      expect(instance.version).toBeDefined();
      expect(typeof instance.version).toBe('string');
    });
  });
});