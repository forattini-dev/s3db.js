import { ConnectionString, S3_DEFAULT_REGION, S3_DEFAULT_ENDPOINT } from '../src/connection-string.class.js';

describe('ConnectionString Journey Tests - Multi-Provider S3 Configuration', () => {
  describe('Cenário 1: Configuração AWS S3 Production', () => {
    test('Deve configurar conexão AWS S3 com bucket simples', () => {
      const connectionString = 's3://myaccesskey:mysecretkey@production-bucket';
      const connection = new ConnectionString(connectionString);

      expect(connection.bucket).toBe('production-bucket');
      expect(connection.accessKeyId).toBe('myaccesskey');
      expect(connection.secretAccessKey).toBe('mysecretkey');
      expect(connection.endpoint).toBe(S3_DEFAULT_ENDPOINT);
      expect(connection.region).toBe(S3_DEFAULT_REGION);
      expect(connection.keyPrefix).toBe('');
      expect(connection.forcePathStyle).toBeUndefined();
    });

    test('Deve configurar conexão AWS S3 com prefixo de chave', () => {
      const connectionString = 's3://accesskey:secretkey@my-app-bucket/environment/production';
      const connection = new ConnectionString(connectionString);

      expect(connection.bucket).toBe('my-app-bucket');
      expect(connection.accessKeyId).toBe('accesskey');
      expect(connection.secretAccessKey).toBe('secretkey');
      expect(connection.keyPrefix).toBe('environment/production');
      expect(connection.endpoint).toBe(S3_DEFAULT_ENDPOINT);
    });

    test('Deve configurar conexão AWS S3 com múltiplos níveis de prefixo', () => {
      const connectionString = 's3://key:secret@company-data/app/microservice/user-service/prod';
      const connection = new ConnectionString(connectionString);

      expect(connection.bucket).toBe('company-data');
      expect(connection.keyPrefix).toBe('app/microservice/user-service/prod');
      expect(connection.accessKeyId).toBe('key');
      expect(connection.secretAccessKey).toBe('secret');
    });

    test('Deve configurar conexão AWS S3 com parâmetros de query', () => {
      const connectionString = 's3://accesskey:secretkey@bucket?region=eu-west-1&verbose=true&parallelism=20';
      const connection = new ConnectionString(connectionString);

      expect(connection.bucket).toBe('bucket');
      expect(connection.accessKeyId).toBe('accesskey');
      expect(connection.secretAccessKey).toBe('secretkey');
      expect(connection.region).toBe('eu-west-1'); // Sobrescreve default
      expect(connection.verbose).toBe('true');
      expect(connection.parallelism).toBe('20');
    });
  });

  describe('Cenário 2: Configuração MinIO Development', () => {
    test('Deve configurar conexão MinIO básica com bucket padrão', () => {
      const connectionString = 'http://minioadmin:minioadmin@localhost:9000';
      const connection = new ConnectionString(connectionString);

      expect(connection.bucket).toBe('s3db'); // Bucket padrão para MinIO
      expect(connection.accessKeyId).toBe('minioadmin');
      expect(connection.secretAccessKey).toBe('minioadmin');
      expect(connection.endpoint).toBe('http://localhost:9000');
      expect(connection.keyPrefix).toBe('');
      expect(connection.forcePathStyle).toBe(true);
    });

    test('Deve configurar conexão MinIO com bucket específico', () => {
      const connectionString = 'http://devuser:devpass@minio.company.com:9000/development-bucket';
      const connection = new ConnectionString(connectionString);

      expect(connection.bucket).toBe('development-bucket');
      expect(connection.accessKeyId).toBe('devuser');
      expect(connection.secretAccessKey).toBe('devpass');
      expect(connection.endpoint).toBe('http://minio.company.com:9000');
      expect(connection.forcePathStyle).toBe(true);
    });

    test('Deve configurar conexão MinIO com bucket e prefixo', () => {
      const connectionString = 'https://admin:password@storage.dev.company.com/test-bucket/app/feature-branch';
      const connection = new ConnectionString(connectionString);

      expect(connection.bucket).toBe('test-bucket');
      expect(connection.keyPrefix).toBe('app/feature-branch');
      expect(connection.accessKeyId).toBe('admin');
      expect(connection.secretAccessKey).toBe('password');
      expect(connection.endpoint).toBe('https://storage.dev.company.com');
      expect(connection.forcePathStyle).toBe(true);
    });

    test('Deve configurar conexão MinIO com parâmetros adicionais', () => {
      const connectionString = 'http://test:test@localhost:9000/test-bucket?region=us-west-2&parallelism=5&verbose=false';
      const connection = new ConnectionString(connectionString);

      expect(connection.bucket).toBe('test-bucket');
      expect(connection.region).toBe('us-west-2');
      expect(connection.parallelism).toBe('5');
      expect(connection.verbose).toBe('false');
      expect(connection.forcePathStyle).toBe(true);
    });
  });

  describe('Cenário 3: Configurações de diferentes ambientes', () => {
    const environments = {
      development: {
        connectionString: 'http://dev:devpass@localhost:9000/dev-bucket/app?verbose=true',
        expected: {
          bucket: 'dev-bucket',
          keyPrefix: 'app',
          endpoint: 'http://localhost:9000',
          forcePathStyle: true,
          verbose: 'true'
        }
      },
      staging: {
        connectionString: 's3://staging-key:staging-secret@staging-company-app/staging?region=us-west-1',
        expected: {
          bucket: 'staging-company-app',
          keyPrefix: 'staging',
          endpoint: S3_DEFAULT_ENDPOINT,
          region: 'us-west-1',
          forcePathStyle: undefined
        }
      },
      production: {
        connectionString: 's3://prod-access:prod-secret@prod-company-app/production/v2?region=eu-central-1&parallelism=50',
        expected: {
          bucket: 'prod-company-app',
          keyPrefix: 'production/v2',
          region: 'eu-central-1',
          parallelism: '50'
        }
      }
    };

    test('Deve configurar corretamente para todos os ambientes', () => {
      Object.entries(environments).forEach(([envName, config]) => {
        const connection = new ConnectionString(config.connectionString);
        
        Object.entries(config.expected).forEach(([key, value]) => {
          expect(connection[key]).toBe(value);
        });
      });
    });

    test('Deve manter isolamento entre diferentes instâncias', () => {
      const connections = Object.entries(environments).map(([name, config]) => ({
        name,
        connection: new ConnectionString(config.connectionString)
      }));

      // Verificar que cada conexão mantém suas configurações específicas
      expect(connections[0].connection.bucket).toBe('dev-bucket');
      expect(connections[1].connection.bucket).toBe('staging-company-app');
      expect(connections[2].connection.bucket).toBe('prod-company-app');

      // Verificar que endpoints são diferentes
      expect(connections[0].connection.endpoint).toBe('http://localhost:9000');
      expect(connections[1].connection.endpoint).toBe(S3_DEFAULT_ENDPOINT);
      expect(connections[2].connection.endpoint).toBe(S3_DEFAULT_ENDPOINT);
    });
  });

  describe('Cenário 4: Configurações especiais e edge cases', () => {
    test('Deve lidar com credenciais com caracteres especiais', () => {
      const connectionString = 's3://user%40company.com:p%40ssw0rd%21@bucket';
      const connection = new ConnectionString(connectionString);

      expect(connection.accessKeyId).toBe('user@company.com');
      expect(connection.secretAccessKey).toBe('p@ssw0rd!');
      expect(connection.bucket).toBe('bucket');
    });

    test('Deve configurar conexão com apenas barra no path (root)', () => {
      const connectionString = 's3://key:secret@bucket/';
      const connection = new ConnectionString(connectionString);

      expect(connection.bucket).toBe('bucket');
      expect(connection.keyPrefix).toBe('');
    });

    test('Deve configurar conexão MinIO com apenas barra no path', () => {
      const connectionString = 'http://admin:admin@minio:9000/';
      const connection = new ConnectionString(connectionString);

      expect(connection.bucket).toBe('s3db'); // Default bucket
      expect(connection.keyPrefix).toBe('');
    });

    test('Deve configurar conexão com múltiplos parâmetros de query', () => {
      const connectionString = 's3://key:secret@bucket?region=ap-southeast-1&verbose=true&parallelism=10&cache=false&timeout=30000';
      const connection = new ConnectionString(connectionString);

      expect(connection.region).toBe('ap-southeast-1');
      expect(connection.verbose).toBe('true');
      expect(connection.parallelism).toBe('10');
      expect(connection.cache).toBe('false');
      expect(connection.timeout).toBe('30000');
    });
  });

  describe('Cenário 5: Validação de strings de conexão inválidas', () => {
    test('Deve rejeitar string de conexão malformada', () => {
      const invalidConnectionStrings = [
        'invalid-string',
        'not-a-url',
        '',
        'ftp://invalid:protocol@bucket',
        'just-text-without-protocol'
      ];

      invalidConnectionStrings.forEach(invalidString => {
        expect(() => {
          new ConnectionString(invalidString);
        }).toThrow('Invalid connection string');
      });
    });

    test('Deve rejeitar URLs sem hostname para S3', () => {
      expect(() => {
        new ConnectionString('s3://key:secret@');
      }).toThrow();
    });

    test('Deve fornecer mensagem de erro clara para strings inválidas', () => {
      const invalidString = 'completely-invalid-format';
      
      try {
        new ConnectionString(invalidString);
      } catch (error) {
        expect(error.message).toContain('Invalid connection string');
        expect(error.message).toContain(invalidString);
      }
    });
  });

  describe('Cenário 6: Casos de uso em microserviços', () => {
    test('Deve configurar conexões para diferentes microserviços', () => {
      const microservices = [
        {
          name: 'user-service',
          connectionString: 's3://svc-user:secret1@company-data/microservices/user-service/prod?region=us-east-1',
          expectedPrefix: 'microservices/user-service/prod'
        },
        {
          name: 'order-service',
          connectionString: 's3://svc-order:secret2@company-data/microservices/order-service/prod?region=us-east-1',
          expectedPrefix: 'microservices/order-service/prod'
        },
        {
          name: 'payment-service',
          connectionString: 's3://svc-payment:secret3@company-data/microservices/payment-service/prod?region=us-east-1',
          expectedPrefix: 'microservices/payment-service/prod'
        }
      ];

      const connections = microservices.map(svc => ({
        name: svc.name,
        connection: new ConnectionString(svc.connectionString),
        expectedPrefix: svc.expectedPrefix
      }));

      connections.forEach(({ name, connection, expectedPrefix }) => {
        expect(connection.bucket).toBe('company-data');
        expect(connection.keyPrefix).toBe(expectedPrefix);
        expect(connection.region).toBe('us-east-1');
      });

      // Verificar que cada serviço tem suas próprias credenciais
      expect(connections[0].connection.accessKeyId).toBe('svc-user');
      expect(connections[1].connection.accessKeyId).toBe('svc-order');
      expect(connections[2].connection.accessKeyId).toBe('svc-payment');
    });

    test('Deve configurar ambientes de feature branch', () => {
      const featureBranch = 'feature-user-auth-v2';
      const connectionString = `http://dev:devpass@minio:9000/feature-branches/${featureBranch}?verbose=true`;
      const connection = new ConnectionString(connectionString);

      expect(connection.bucket).toBe('feature-branches');
      expect(connection.keyPrefix).toBe(featureBranch);
      expect(connection.endpoint).toBe('http://minio:9000');
      expect(connection.forcePathStyle).toBe(true);
      expect(connection.verbose).toBe('true');
    });

    test('Deve configurar conexões para testes automatizados', () => {
      const testConnectionString = 'http://test:test@localhost:9000/automated-tests/ci-build-123?region=local&parallelism=1';
      const connection = new ConnectionString(testConnectionString);

      expect(connection.bucket).toBe('automated-tests');
      expect(connection.keyPrefix).toBe('ci-build-123');
      expect(connection.region).toBe('local');
      expect(connection.parallelism).toBe('1');
      expect(connection.forcePathStyle).toBe(true);
    });
  });

  describe('Cenário 7: Configurações de alta disponibilidade', () => {
    test('Deve configurar conexão para réplicas de diferentes regiões', () => {
      const regions = [
        { region: 'us-east-1', connectionString: 's3://replica:key1@backup-us-east/replicas/primary?region=us-east-1' },
        { region: 'eu-west-1', connectionString: 's3://replica:key2@backup-eu-west/replicas/secondary?region=eu-west-1' },
        { region: 'ap-southeast-1', connectionString: 's3://replica:key3@backup-ap-southeast/replicas/tertiary?region=ap-southeast-1' }
      ];

      const connections = regions.map(r => ({
        region: r.region,
        connection: new ConnectionString(r.connectionString)
      }));

      connections.forEach(({ region, connection }) => {
        expect(connection.region).toBe(region);
        expect(connection.bucket).toContain('backup');
        expect(connection.keyPrefix).toContain('replicas');
      });

      // Verificar buckets diferentes por região
      expect(connections[0].connection.bucket).toBe('backup-us-east');
      expect(connections[1].connection.bucket).toBe('backup-eu-west');
      expect(connections[2].connection.bucket).toBe('backup-ap-southeast');
    });

    test('Deve configurar conexão para backup com retenção específica', () => {
      const backupConnectionString = 's3://backup:secretkey@long-term-storage/backups/yearly/2024?region=us-west-2&retention=7years';
      const connection = new ConnectionString(backupConnectionString);

      expect(connection.bucket).toBe('long-term-storage');
      expect(connection.keyPrefix).toBe('backups/yearly/2024');
      expect(connection.region).toBe('us-west-2');
      expect(connection.retention).toBe('7years');
    });
  });
});