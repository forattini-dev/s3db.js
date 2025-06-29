import { idGenerator, passwordGenerator } from '../src/concerns/id.js';

describe('ID Generator Functions - Unique Identifiers', () => {
  describe('idGenerator', () => {
    test('Deve gerar ID único', () => {
      const id = idGenerator();
      
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    test('Deve gerar IDs únicos a cada chamada', () => {
      const ids = [];
      
      for (let i = 0; i < 100; i++) {
        ids.push(idGenerator());
      }
      
      // Verificar que todos os IDs são únicos
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds).toHaveLength(100);
    });

    test('Deve gerar IDs com formato consistente', () => {
      const ids = [];
      
      for (let i = 0; i < 10; i++) {
        ids.push(idGenerator());
      }
      
      // Verificar que todos os IDs têm o mesmo formato
      const firstIdLength = ids[0].length;
      ids.forEach(id => {
        expect(id.length).toBe(firstIdLength);
        expect(id).toMatch(/^[a-zA-Z0-9-_]+$/); // Formato básico esperado
      });
    });

    test('Deve gerar IDs rapidamente em lote', () => {
      const startTime = Date.now();
      const ids = [];
      
      for (let i = 0; i < 1000; i++) {
        ids.push(idGenerator());
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000); // Deve gerar 1000 IDs em menos de 1 segundo
      expect(ids).toHaveLength(1000);
      
      // Verificar unicidade
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds).toHaveLength(1000);
    });
  });

  describe('passwordGenerator', () => {
    test('Deve gerar password único', () => {
      const password = passwordGenerator();
      
      expect(password).toBeDefined();
      expect(typeof password).toBe('string');
      expect(password.length).toBeGreaterThan(0);
    });

    test('Deve gerar passwords únicos a cada chamada', () => {
      const passwords = [];
      
      for (let i = 0; i < 50; i++) {
        passwords.push(passwordGenerator());
      }
      
      // Verificar que todos os passwords são únicos
      const uniquePasswords = [...new Set(passwords)];
      expect(uniquePasswords).toHaveLength(50);
    });

    test('Deve gerar passwords com comprimento adequado', () => {
      const passwords = [];
      
      for (let i = 0; i < 10; i++) {
        passwords.push(passwordGenerator());
      }
      
      passwords.forEach(password => {
        expect(password.length).toBeGreaterThanOrEqual(8); // Mínimo de segurança
        expect(password.length).toBeLessThanOrEqual(64); // Máximo razoável
      });
    });

    test('Deve gerar passwords com caracteres seguros', () => {
      const passwords = [];
      
      for (let i = 0; i < 20; i++) {
        passwords.push(passwordGenerator());
      }
      
      passwords.forEach(password => {
        // Verificar que contém apenas caracteres seguros
        expect(password).toMatch(/^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/);
        
        // Não deve conter espaços em branco
        expect(password).not.toContain(' ');
        expect(password).not.toContain('\t');
        expect(password).not.toContain('\n');
      });
    });

    test('Deve gerar passwords com boa entropia', () => {
      const passwords = [];
      
      for (let i = 0; i < 10; i++) {
        passwords.push(passwordGenerator());
      }
      
      passwords.forEach(password => {
        // Verificar que o password tem variedade de caracteres
        const hasLowercase = /[a-z]/.test(password);
        const hasUppercase = /[A-Z]/.test(password);
        const hasNumbers = /[0-9]/.test(password);
        
        // Pelo menos 2 dos 3 tipos de caracteres devem estar presentes
        const characterTypeCount = [hasLowercase, hasUppercase, hasNumbers].filter(Boolean).length;
        expect(characterTypeCount).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Cenários de uso real', () => {
    test('Deve gerar IDs para diferentes recursos', () => {
      const userIds = [];
      const orderIds = [];
      const productIds = [];
      
      for (let i = 0; i < 10; i++) {
        userIds.push(idGenerator());
        orderIds.push(idGenerator());
        productIds.push(idGenerator());
      }
      
      // Verificar que todos os IDs são únicos globalmente
      const allIds = [...userIds, ...orderIds, ...productIds];
      const uniqueIds = [...new Set(allIds)];
      expect(uniqueIds).toHaveLength(30);
    });

    test('Deve gerar passwords para diferentes usuários', () => {
      const users = [
        { username: 'admin', password: passwordGenerator() },
        { username: 'user1', password: passwordGenerator() },
        { username: 'user2', password: passwordGenerator() },
        { username: 'guest', password: passwordGenerator() }
      ];
      
      // Verificar que todas as passwords são únicas
      const passwords = users.map(user => user.password);
      const uniquePasswords = [...new Set(passwords)];
      expect(uniquePasswords).toHaveLength(4);
      
      // Verificar que todas as passwords são válidas
      passwords.forEach(password => {
        expect(password.length).toBeGreaterThan(0);
        expect(typeof password).toBe('string');
      });
    });

    test('Deve gerar IDs para sistema de partições', () => {
      const partitionedIds = {
        byCompany: {
          'company-001': [],
          'company-002': [],
          'company-003': []
        },
        byDepartment: {
          'engineering': [],
          'marketing': [],
          'sales': []
        }
      };
      
      // Gerar IDs para cada partição
      Object.keys(partitionedIds.byCompany).forEach(company => {
        for (let i = 0; i < 5; i++) {
          partitionedIds.byCompany[company].push(idGenerator());
        }
      });
      
      Object.keys(partitionedIds.byDepartment).forEach(dept => {
        for (let i = 0; i < 3; i++) {
          partitionedIds.byDepartment[dept].push(idGenerator());
        }
      });
      
      // Verificar unicidade global
      const allPartitionedIds = [
        ...Object.values(partitionedIds.byCompany).flat(),
        ...Object.values(partitionedIds.byDepartment).flat()
      ];
      
      const uniquePartitionedIds = [...new Set(allPartitionedIds)];
      expect(uniquePartitionedIds).toHaveLength(allPartitionedIds.length);
    });

    test('Deve gerar credentials para sistema de API keys', () => {
      const apiKeys = [];
      
      for (let i = 0; i < 25; i++) {
        apiKeys.push({
          id: idGenerator(),
          key: passwordGenerator(),
          type: i % 4 === 0 ? 'live' : 
                i % 4 === 1 ? 'test' : 
                i % 4 === 2 ? 'dev' : 'sandbox'
        });
      }
      
      // Verificar que todos os IDs são únicos
      const ids = apiKeys.map(key => key.id);
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds).toHaveLength(25);
      
      // Verificar que todas as API keys são únicas
      const keys = apiKeys.map(key => key.key);
      const uniqueKeys = [...new Set(keys)];
      expect(uniqueKeys).toHaveLength(25);
      
      // Verificar distribuição dos tipos
      const types = apiKeys.map(key => key.type);
      const typeCount = {
        live: types.filter(t => t === 'live').length,
        test: types.filter(t => t === 'test').length,
        dev: types.filter(t => t === 'dev').length,
        sandbox: types.filter(t => t === 'sandbox').length
      };
      
      expect(typeCount.live).toBeGreaterThan(0);
      expect(typeCount.test).toBeGreaterThan(0);
      expect(typeCount.dev).toBeGreaterThan(0);
      expect(typeCount.sandbox).toBeGreaterThan(0);
    });
  });

  describe('Performance e stress test', () => {
    test('Deve manter performance com geração massiva de IDs', () => {
      const startTime = Date.now();
      const ids = [];
      
      for (let i = 0; i < 10000; i++) {
        ids.push(idGenerator());
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5000); // Menos de 5 segundos para 10k IDs
      expect(ids).toHaveLength(10000);
      
      // Verificar unicidade mesmo com grande volume
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds).toHaveLength(10000);
    });

    test('Deve manter performance com geração massiva de passwords', () => {
      const startTime = Date.now();
      const passwords = [];
      
      for (let i = 0; i < 1000; i++) {
        passwords.push(passwordGenerator());
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(2000); // Menos de 2 segundos para 1k passwords
      expect(passwords).toHaveLength(1000);
      
      // Verificar unicidade
      const uniquePasswords = [...new Set(passwords)];
      expect(uniquePasswords).toHaveLength(1000);
    });

    test('Deve gerar IDs e passwords simultaneamente sem conflitos', () => {
      const results = [];
      
      for (let i = 0; i < 100; i++) {
        results.push({
          id: idGenerator(),
          password: passwordGenerator(),
          timestamp: Date.now()
        });
      }
      
      // Verificar que todos os IDs são únicos
      const ids = results.map(r => r.id);
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds).toHaveLength(100);
      
      // Verificar que todas as passwords são únicas
      const passwords = results.map(r => r.password);
      const uniquePasswords = [...new Set(passwords)];
      expect(uniquePasswords).toHaveLength(100);
      
      // Verificar que os timestamps estão ordenados
      const timestamps = results.map(r => r.timestamp);
      const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
      expect(timestamps).toEqual(sortedTimestamps);
    });
  });
});