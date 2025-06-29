import Client from '../src/client.class.js';

describe('Client Journey Tests - Connection and Configuration', () => {
  describe('Cenário 1: Configuração básica de cliente', () => {
    test('Deve criar cliente com configurações mínimas', () => {
      const client = new Client({
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
      });

      expect(client.config.bucket).toBe('test-bucket');
      expect(client.config.region).toBe('us-east-1');
      expect(client.config.accessKeyId).toBe('test-key');
      expect(client.config.secretAccessKey).toBe('test-secret');
    });

    test('Deve aplicar configurações padrão quando não especificadas', () => {
      const client = new Client({
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
      });

      // Verificar configurações padrão
      expect(client.config.forcePathStyle).toBe(false);
      expect(client.config.endpoint).toBeUndefined();
    });

    test('Deve aceitar configurações customizadas para LocalStack', () => {
      const client = new Client({
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        endpoint: 'http://localhost:4566',
        forcePathStyle: true
      });

      expect(client.config.endpoint).toBe('http://localhost:4566');
      expect(client.config.forcePathStyle).toBe(true);
    });
  });

  describe('Cenário 2: Validação de configurações', () => {
    test('Deve rejeitar configuração sem bucket', () => {
      expect(() => {
        new Client({
          region: 'us-east-1',
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret'
        });
      }).toThrow();
    });

    test('Deve rejeitar configuração sem region', () => {
      expect(() => {
        new Client({
          bucket: 'test-bucket',
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret'
        });
      }).toThrow();
    });

    test('Deve rejeitar configuração sem credenciais', () => {
      expect(() => {
        new Client({
          bucket: 'test-bucket',
          region: 'us-east-1'
        });
      }).toThrow();
    });

    test('Deve rejeitar nome de bucket inválido', () => {
      expect(() => {
        new Client({
          bucket: 'INVALID_BUCKET_NAME', // Bucket names should be lowercase
          region: 'us-east-1',
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret'
        });
      }).toThrow();
    });
  });

  describe('Cenário 3: Configurações de diferentes ambientes', () => {
    const environments = [
      {
        name: 'Development',
        config: {
          bucket: 'dev-app-bucket',
          region: 'us-east-1',
          accessKeyId: 'dev-access-key',
          secretAccessKey: 'dev-secret-key',
          endpoint: 'http://localhost:4566',
          forcePathStyle: true
        }
      },
      {
        name: 'Staging',
        config: {
          bucket: 'staging-app-bucket',
          region: 'us-west-2',
          accessKeyId: 'staging-access-key',
          secretAccessKey: 'staging-secret-key'
        }
      },
      {
        name: 'Production',
        config: {
          bucket: 'prod-app-bucket',
          region: 'eu-west-1',
          accessKeyId: 'prod-access-key',
          secretAccessKey: 'prod-secret-key'
        }
      }
    ];

    test('Deve criar clientes para diferentes ambientes', () => {
      const clients = {};

      environments.forEach(env => {
        clients[env.name.toLowerCase()] = new Client(env.config);
      });

      expect(Object.keys(clients)).toHaveLength(3);
      
      // Verificar configurações específicas
      expect(clients.development.config.endpoint).toBe('http://localhost:4566');
      expect(clients.development.config.forcePathStyle).toBe(true);
      
      expect(clients.staging.config.region).toBe('us-west-2');
      expect(clients.staging.config.endpoint).toBeUndefined();
      
      expect(clients.production.config.region).toBe('eu-west-1');
      expect(clients.production.config.bucket).toBe('prod-app-bucket');
    });
  });

  describe('Cenário 4: Testes de conectividade simulados', () => {
    let client;

    beforeEach(() => {
      client = new Client({
        bucket: 'test-connectivity-bucket',
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        endpoint: 'http://localhost:4566',
        forcePathStyle: true
      });
    });

    test('Deve ter cliente S3 configurado', () => {
      expect(client.s3).toBeDefined();
      expect(client.s3.config).toBeDefined();
      expect(client.s3.config.region).toBe('us-east-1');
    });

    test('Deve configurar parâmetros corretos para operações S3', () => {
      const testKey = 'test-key';
      const expectedParams = {
        Bucket: 'test-connectivity-bucket',
        Key: testKey
      };

      // Simular como o cliente prepararia parâmetros para operações S3
      const getParams = {
        Bucket: client.config.bucket,
        Key: testKey
      };

      expect(getParams).toEqual(expectedParams);
    });

    test('Deve preparar parâmetros corretamente para diferentes operações', () => {
      const testData = { content: 'test data' };
      const testKey = 'resource=users/v=1/id=user-123';

      // Simular parâmetros para diferentes operações
      const operations = {
        get: {
          Bucket: client.config.bucket,
          Key: testKey
        },
        put: {
          Bucket: client.config.bucket,
          Key: testKey,
          Body: JSON.stringify(testData),
          ContentType: 'application/json'
        },
        delete: {
          Bucket: client.config.bucket,
          Key: testKey
        },
        list: {
          Bucket: client.config.bucket,
          Prefix: 'resource=users/',
          MaxKeys: 100
        }
      };

      // Verificar que todos os parâmetros incluem o bucket correto
      Object.values(operations).forEach(params => {
        expect(params.Bucket).toBe('test-connectivity-bucket');
      });

      expect(operations.put.ContentType).toBe('application/json');
      expect(operations.list.MaxKeys).toBe(100);
    });
  });

  describe('Cenário 5: Configurações avançadas e otimizações', () => {
    test('Deve configurar cliente com retry customizado', () => {
      const client = new Client({
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        maxRetries: 5,
        retryDelayOptions: {
          base: 300
        }
      });

      expect(client.s3.config.maxRetries).toBe(5);
      expect(client.s3.config.retryDelayOptions.base).toBe(300);
    });

    test('Deve configurar timeout customizado', () => {
      const client = new Client({
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        httpOptions: {
          timeout: 30000,
          connectTimeout: 5000
        }
      });

      expect(client.s3.config.httpOptions.timeout).toBe(30000);
      expect(client.s3.config.httpOptions.connectTimeout).toBe(5000);
    });

    test('Deve configurar SSL/TLS customizado', () => {
      const client = new Client({
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        sslEnabled: true,
        s3ForcePathStyle: false
      });

      expect(client.s3.config.sslEnabled).toBe(true);
      expect(client.s3.config.s3ForcePathStyle).toBe(false);
    });
  });

  describe('Cenário 6: Cenários de erro e recuperação', () => {
    test('Deve lidar com configurações malformadas graciosamente', () => {
      // Testar com valores undefined/null
      expect(() => {
        new Client({
          bucket: null,
          region: 'us-east-1',
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret'
        });
      }).toThrow();

      expect(() => {
        new Client({
          bucket: 'test-bucket',
          region: undefined,
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret'
        });
      }).toThrow();
    });

    test('Deve validar credenciais vazias', () => {
      expect(() => {
        new Client({
          bucket: 'test-bucket',
          region: 'us-east-1',
          accessKeyId: '',
          secretAccessKey: 'test-secret'
        });
      }).toThrow();

      expect(() => {
        new Client({
          bucket: 'test-bucket',
          region: 'us-east-1',
          accessKeyId: 'test-key',
          secretAccessKey: ''
        });
      }).toThrow();
    });

    test('Deve rejeitar regiões inválidas', () => {
      expect(() => {
        new Client({
          bucket: 'test-bucket',
          region: 'invalid-region-123',
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret'
        });
      }).toThrow();
    });
  });

  describe('Cenário 7: Múltiplos clientes para diferentes casos de uso', () => {
    test('Deve criar múltiplos clientes isolados', () => {
      const clientA = new Client({
        bucket: 'bucket-a',
        region: 'us-east-1',
        accessKeyId: 'key-a',
        secretAccessKey: 'secret-a'
      });

      const clientB = new Client({
        bucket: 'bucket-b',
        region: 'eu-west-1',
        accessKeyId: 'key-b',
        secretAccessKey: 'secret-b'
      });

      // Verificar isolamento
      expect(clientA.config.bucket).toBe('bucket-a');
      expect(clientB.config.bucket).toBe('bucket-b');
      expect(clientA.config.region).toBe('us-east-1');
      expect(clientB.config.region).toBe('eu-west-1');
      
      // Verificar que são instâncias diferentes
      expect(clientA).not.toBe(clientB);
      expect(clientA.s3).not.toBe(clientB.s3);
    });

    test('Deve suportar configurações específicas por cliente', () => {
      const clients = {
        analytics: new Client({
          bucket: 'analytics-data-bucket',
          region: 'us-east-1',
          accessKeyId: 'analytics-key',
          secretAccessKey: 'analytics-secret',
          maxRetries: 3
        }),
        backup: new Client({
          bucket: 'backup-storage-bucket',
          region: 'us-west-2',
          accessKeyId: 'backup-key',
          secretAccessKey: 'backup-secret',
          maxRetries: 10 // Mais retries para backup
        }),
        media: new Client({
          bucket: 'media-assets-bucket',
          region: 'eu-central-1',
          accessKeyId: 'media-key',
          secretAccessKey: 'media-secret',
          httpOptions: {
            timeout: 60000 // Timeout maior para uploads de mídia
          }
        })
      };

      expect(clients.analytics.s3.config.maxRetries).toBe(3);
      expect(clients.backup.s3.config.maxRetries).toBe(10);
      expect(clients.media.s3.config.httpOptions.timeout).toBe(60000);
      
      // Verificar buckets diferentes
      const buckets = Object.values(clients).map(client => client.config.bucket);
      const uniqueBuckets = [...new Set(buckets)];
      expect(uniqueBuckets).toHaveLength(3);
    });
  });
});