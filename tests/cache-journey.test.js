import { Cache } from '../src/cache/cache.class.js';
import EventEmitter from 'events';

describe('Cache Journey Tests - Base Cache System Implementation', () => {
  describe('Cenário 1: Implementação personalizada de cache para aplicação', () => {
    class TestCache extends Cache {
      constructor(config = {}) {
        super(config);
        this.storage = new Map();
        this.ttlTimers = new Map();
        this.defaultTTL = config.defaultTTL || 60000; // 1 minuto
      }

      async _set(key, data) {
        // Implementar TTL se configurado
        if (this.config.enableTTL && this.defaultTTL > 0) {
          // Limpar timer anterior se existir
          if (this.ttlTimers.has(key)) {
            clearTimeout(this.ttlTimers.get(key));
          }

          // Configurar novo timer
          const timer = setTimeout(() => {
            this.storage.delete(key);
            this.ttlTimers.delete(key);
            this.emit('expired', { key, data });
          }, this.defaultTTL);

          this.ttlTimers.set(key, timer);
        }

        this.storage.set(key, {
          data,
          timestamp: Date.now(),
          ttl: this.defaultTTL
        });
        return data;
      }

      async _get(key) {
        const item = this.storage.get(key);
        if (!item) return null;

        // Verificar se expirou (double check)
        if (this.config.enableTTL && Date.now() - item.timestamp > item.ttl) {
          this.storage.delete(key);
          if (this.ttlTimers.has(key)) {
            clearTimeout(this.ttlTimers.get(key));
            this.ttlTimers.delete(key);
          }
          return null;
        }

        return item.data;
      }

      async _del(key) {
        const item = this.storage.get(key);
        if (item) {
          this.storage.delete(key);
          if (this.ttlTimers.has(key)) {
            clearTimeout(this.ttlTimers.get(key));
            this.ttlTimers.delete(key);
          }
          return item.data;
        }
        return null;
      }

      async _clear() {
        const count = this.storage.size;
        
        // Limpar todos os timers
        for (const timer of this.ttlTimers.values()) {
          clearTimeout(timer);
        }
        
        this.storage.clear();
        this.ttlTimers.clear();
        return { cleared: count };
      }

      // Métodos adicionais para teste
      size() {
        return this.storage.size;
      }

      keys() {
        return Array.from(this.storage.keys());
      }
    }

    let cache;
    let events;

    beforeEach(() => {
      events = [];
      cache = new TestCache({
        enableTTL: true,
        defaultTTL: 100 // 100ms para testes rápidos
      });

      // Capturar todos os eventos
      ['set', 'get', 'delete', 'clear', 'expired'].forEach(event => {
        cache.on(event, (data) => {
          events.push({ event, data, timestamp: Date.now() });
        });
      });
    });

    afterEach(() => {
      cache.removeAllListeners();
    });

    test('Deve implementar cache básico com eventos', async () => {
      const sessionData = {
        userId: 'user-123',
        name: 'João Silva',
        permissions: ['read', 'write'],
        preferences: {
          theme: 'dark',
          language: 'pt-BR'
        }
      };

      // Set data
      const setResult = await cache.set('session:user-123', sessionData);
      expect(setResult).toEqual(sessionData);
      expect(cache.size()).toBe(1);

      // Verificar evento set
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('set');
      expect(events[0].data).toEqual(sessionData);

      // Get data
      const getData = await cache.get('session:user-123');
      expect(getData).toEqual(sessionData);

      // Verificar evento get
      expect(events).toHaveLength(2);
      expect(events[1].event).toBe('get');
      expect(events[1].data).toEqual(sessionData);
    });

    test('Deve validar chaves corretamente', async () => {
      const invalidKeys = [null, undefined, '', 123, {}, []];

      for (const invalidKey of invalidKeys) {
        await expect(cache.set(invalidKey, 'data')).rejects.toThrow('Invalid key');
        await expect(cache.get(invalidKey)).rejects.toThrow('Invalid key');
        await expect(cache.del(invalidKey)).rejects.toThrow('Invalid key');
      }

      expect(events).toHaveLength(0); // Nenhuma operação deve ter sido executada
    });

    test('Deve gerenciar TTL e expiração automaticamente', async () => {
      const tempData = {
        token: 'temp-token-12345',
        expiresAt: Date.now() + 1000
      };

      await cache.set('temp:token', tempData);
      expect(cache.size()).toBe(1);

      // Verificar que dados estão disponíveis imediatamente
      const immediateGet = await cache.get('temp:token');
      expect(immediateGet).toEqual(tempData);

      // Aguardar expiração (TTL = 100ms)
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verificar que dados expiraram
      const expiredGet = await cache.get('temp:token');
      expect(expiredGet).toBeNull();
      expect(cache.size()).toBe(0);

      // Verificar evento de expiração
      const expiredEvents = events.filter(e => e.event === 'expired');
      expect(expiredEvents).toHaveLength(1);
      expect(expiredEvents[0].data.key).toBe('temp:token');
    });

    test('Deve deletar itens específicos', async () => {
      const items = [
        { key: 'cache:item1', data: { value: 'Item 1' } },
        { key: 'cache:item2', data: { value: 'Item 2' } },
        { key: 'cache:item3', data: { value: 'Item 3' } }
      ];

      // Adicionar items
      for (const item of items) {
        await cache.set(item.key, item.data);
      }
      expect(cache.size()).toBe(3);

      // Deletar item específico
      const deleted = await cache.del('cache:item2');
      expect(deleted).toEqual({ value: 'Item 2' });
      expect(cache.size()).toBe(2);

      // Verificar que item foi removido
      const getDeleted = await cache.get('cache:item2');
      expect(getDeleted).toBeNull();

      // Verificar que outros items ainda existem
      const item1 = await cache.get('cache:item1');
      const item3 = await cache.get('cache:item3');
      expect(item1).toEqual({ value: 'Item 1' });
      expect(item3).toEqual({ value: 'Item 3' });

      // Verificar evento delete
      const deleteEvents = events.filter(e => e.event === 'delete');
      expect(deleteEvents).toHaveLength(1);
      expect(deleteEvents[0].data).toEqual({ value: 'Item 2' });
    });

    test('Deve limpar todo o cache', async () => {
      const testData = [
        { key: 'user:123', data: { name: 'User 1' } },
        { key: 'user:456', data: { name: 'User 2' } },
        { key: 'session:abc', data: { token: 'abc123' } },
        { key: 'config:app', data: { theme: 'dark' } }
      ];

      // Adicionar múltiplos items
      for (const item of testData) {
        await cache.set(item.key, item.data);
      }
      expect(cache.size()).toBe(4);

      // Clear all
      const clearResult = await cache.clear();
      expect(clearResult.cleared).toBe(4);
      expect(cache.size()).toBe(0);

      // Verificar que todos os items foram removidos
      for (const item of testData) {
        const getData = await cache.get(item.key);
        expect(getData).toBeNull();
      }

      // Verificar evento clear
      const clearEvents = events.filter(e => e.event === 'clear');
      expect(clearEvents).toHaveLength(1);
      expect(clearEvents[0].data.cleared).toBe(4);
    });
  });

  describe('Cenário 2: Cache para aplicação de e-commerce', () => {
    class EcommerceCache extends Cache {
      constructor() {
        super();
        this.productCache = new Map();
        this.userCache = new Map();
        this.statsCache = new Map();
      }

      getNamespace(key) {
        const parts = key.split(':');
        return parts[0];
      }

      async _set(key, data) {
        const namespace = this.getNamespace(key);
        const item = {
          data,
          timestamp: Date.now(),
          namespace,
          size: JSON.stringify(data).length
        };

        switch (namespace) {
          case 'product':
            this.productCache.set(key, item);
            break;
          case 'user':
            this.userCache.set(key, item);
            break;
          case 'stats':
            this.statsCache.set(key, item);
            break;
          default:
            throw new Error(`Unknown namespace: ${namespace}`);
        }

        return data;
      }

      async _get(key) {
        const namespace = this.getNamespace(key);
        let cache;

        switch (namespace) {
          case 'product':
            cache = this.productCache;
            break;
          case 'user':
            cache = this.userCache;
            break;
          case 'stats':
            cache = this.statsCache;
            break;
          default:
            return null;
        }

        const item = cache.get(key);
        return item ? item.data : null;
      }

      async _del(key) {
        const namespace = this.getNamespace(key);
        let cache;

        switch (namespace) {
          case 'product':
            cache = this.productCache;
            break;
          case 'user':
            cache = this.userCache;
            break;
          case 'stats':
            cache = this.statsCache;
            break;
          default:
            return null;
        }

        const item = cache.get(key);
        if (item) {
          cache.delete(key);
          return item.data;
        }
        return null;
      }

      async _clear() {
        const totalSize = this.productCache.size + this.userCache.size + this.statsCache.size;
        
        this.productCache.clear();
        this.userCache.clear();
        this.statsCache.clear();

        return { cleared: totalSize };
      }

      // Métodos específicos para e-commerce
      getStats() {
        return {
          products: this.productCache.size,
          users: this.userCache.size,
          stats: this.statsCache.size,
          total: this.productCache.size + this.userCache.size + this.statsCache.size
        };
      }
    }

    let ecommerceCache;
    let events;

    beforeEach(() => {
      events = [];
      ecommerceCache = new EcommerceCache();

      ecommerceCache.on('set', (data) => events.push({ event: 'set', data }));
      ecommerceCache.on('get', (data) => events.push({ event: 'get', data }));
    });

    test('Deve gerenciar cache segmentado por namespace', async () => {
      // Dados de produto
      const productData = {
        id: 'prod-123',
        name: 'Smartphone Galaxy S24',
        price: 899.99,
        category: 'electronics',
        stock: 100
      };

      // Dados de usuário
      const userData = {
        id: 'user-456',
        name: 'Maria Silva',
        email: 'maria@email.com',
        preferences: { theme: 'dark' }
      };

      // Dados de estatísticas
      const statsData = {
        date: '2024-01-15',
        sales: 1234,
        visits: 5678,
        conversion: 0.21
      };

      // Armazenar em diferentes namespaces
      await ecommerceCache.set('product:prod-123', productData);
      await ecommerceCache.set('user:user-456', userData);
      await ecommerceCache.set('stats:2024-01-15', statsData);

      // Verificar estatísticas
      const stats = ecommerceCache.getStats();
      expect(stats.products).toBe(1);
      expect(stats.users).toBe(1);
      expect(stats.stats).toBe(1);
      expect(stats.total).toBe(3);

      // Recuperar dados
      const getCachedProduct = await ecommerceCache.get('product:prod-123');
      const getCachedUser = await ecommerceCache.get('user:user-456');
      const getCachedStats = await ecommerceCache.get('stats:2024-01-15');

      expect(getCachedProduct).toEqual(productData);
      expect(getCachedUser).toEqual(userData);
      expect(getCachedStats).toEqual(statsData);

      // Verificar eventos
      expect(events.filter(e => e.event === 'set')).toHaveLength(3);
      expect(events.filter(e => e.event === 'get')).toHaveLength(3);
    });

    test('Deve rejeitar namespaces inválidos', async () => {
      await expect(ecommerceCache.set('invalid:key', { data: 'test' }))
        .rejects.toThrow('Unknown namespace: invalid');

      const result = await ecommerceCache.get('invalid:key');
      expect(result).toBeNull();
    });
  });

  describe('Cenário 3: Teste de validação e edge cases', () => {
    class MockCache extends Cache {
      constructor() {
        super();
        this.data = new Map();
      }

      async _set(key, data) {
        this.data.set(key, data);
        return data;
      }

      async _get(key) {
        return this.data.get(key) || null;
      }

      async _del(key) {
        const data = this.data.get(key);
        this.data.delete(key);
        return data || null;
      }

      async _clear() {
        const size = this.data.size;
        this.data.clear();
        return { cleared: size };
      }
    }

    let mockCache;

    beforeEach(() => {
      mockCache = new MockCache();
    });

    test('Deve usar método delete como alias para del', async () => {
      await mockCache.set('test-key', { value: 'test' });
      
      const deleted = await mockCache.delete('test-key');
      expect(deleted).toEqual({ value: 'test' });

      const getAfterDelete = await mockCache.get('test-key');
      expect(getAfterDelete).toBeNull();
    });

    test('Deve lidar com tipos de dados complexos', async () => {
      const complexData = {
        string: 'texto com acentos: ação',
        number: 42.5,
        boolean: true,
        array: [1, 'dois', { três: 3 }],
        object: {
          nested: {
            deep: {
              emoji: '🚀',
              chinese: '你好',
              arabic: 'مرحبا'
            }
          }
        },
        date: new Date('2024-01-15'),
        null: null,
        undefined: undefined
      };

      await mockCache.set('complex:data', complexData);
      const retrieved = await mockCache.get('complex:data');

      expect(retrieved).toEqual(complexData);
    });

    test('Deve lidar com chaves que não existem', async () => {
      const nonExistent = await mockCache.get('does-not-exist');
      expect(nonExistent).toBeNull();

      const deletedNonExistent = await mockCache.del('does-not-exist');
      expect(deletedNonExistent).toBeNull();
    });

    test('Deve herdar corretamente de EventEmitter', () => {
      expect(mockCache).toBeInstanceOf(EventEmitter);
      expect(typeof mockCache.on).toBe('function');
      expect(typeof mockCache.emit).toBe('function');
      expect(typeof mockCache.removeListener).toBe('function');
    });
  });

  describe('Cenário 4: Performance e stress testing', () => {
    class PerformanceCache extends Cache {
      constructor() {
        super();
        this.storage = new Map();
        this.operations = 0;
      }

      async _set(key, data) {
        this.operations++;
        this.storage.set(key, data);
        return data;
      }

      async _get(key) {
        this.operations++;
        return this.storage.get(key) || null;
      }

      async _del(key) {
        this.operations++;
        const data = this.storage.get(key);
        this.storage.delete(key);
        return data || null;
      }

      async _clear() {
        this.operations++;
        const size = this.storage.size;
        this.storage.clear();
        return { cleared: size };
      }

      getOperationCount() {
        return this.operations;
      }

      size() {
        return this.storage.size;
      }
    }

    test('Deve manter performance com muitas operações', async () => {
      const perfCache = new PerformanceCache();
      const itemCount = 1000;

      const startTime = Date.now();

      // Inserir muitos items
      for (let i = 0; i < itemCount; i++) {
        await perfCache.set(`item:${i}`, {
          id: i,
          data: `data-${i}`,
          timestamp: Date.now(),
          metadata: { index: i, even: i % 2 === 0 }
        });
      }

      // Recuperar items aleatórios
      for (let i = 0; i < 100; i++) {
        const randomId = Math.floor(Math.random() * itemCount);
        await perfCache.get(`item:${randomId}`);
      }

      // Deletar alguns items
      for (let i = 0; i < 50; i++) {
        await perfCache.del(`item:${i * 2}`); // Deletar items pares
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000); // Menos de 1 segundo
      expect(perfCache.size()).toBe(itemCount - 50); // 950 items restantes
      expect(perfCache.getOperationCount()).toBe(itemCount + 100 + 50); // Total de operações
    });
  });
});