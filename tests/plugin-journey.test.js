import { Plugin } from '../src/plugins/plugin.class.js';
import { Database } from '../src/database.class.js';
import EventEmitter from 'events';

describe('Plugin Journey Tests - Extensible Plugin System', () => {
  describe('Cenário 1: Plugin de logging para aplicação', () => {
    class LoggingPlugin extends Plugin {
      constructor(config = {}) {
        super();
        this.config = config;
        this.logs = [];
        this.isSetup = false;
        this.isStarted = false;
        this.database = null;
        this.resourceListeners = new Map();
      }

      async setup(database) {
        this.database = database;
        this.isSetup = true;
        
        // Escutar eventos do database
        database.on('s3db.resourceCreated', (resourceName) => {
          this.log('info', `Resource created: ${resourceName}`);
          this.setupResourceLogging(resourceName);
        });

        database.on('s3db.resourceUpdated', (resourceName) => {
          this.log('info', `Resource updated: ${resourceName}`);
        });

        this.log('info', 'Logging plugin setup completed');
      }

      async start() {
        if (!this.isSetup) {
          throw new Error('Plugin must be setup before starting');
        }
        
        this.isStarted = true;
        this.log('info', 'Logging plugin started');
        
        // Setup inicial para recursos existentes
        if (this.database && this.database.resources) {
          Object.keys(this.database.resources).forEach(resourceName => {
            this.setupResourceLogging(resourceName);
          });
        }
      }

      async stop() {
        this.isStarted = false;
        
        // Limpar listeners de recursos
        for (const [resourceName, listeners] of this.resourceListeners) {
          const resource = this.database.resources[resourceName];
          if (resource) {
            listeners.forEach(({ event, listener }) => {
              resource.removeListener(event, listener);
            });
          }
        }
        this.resourceListeners.clear();
        
        this.log('info', 'Logging plugin stopped');
      }

      setupResourceLogging(resourceName) {
        const resource = this.database.resources[resourceName];
        if (!resource) return;

        const listeners = [];

        // Event listeners
        const onInsert = (data) => {
          this.log('debug', `Resource ${resourceName}: item inserted`, { id: data.id });
        };

        const onUpdate = (data) => {
          this.log('debug', `Resource ${resourceName}: item updated`, { id: data.id });
        };

        const onDelete = (id) => {
          this.log('debug', `Resource ${resourceName}: item deleted`, { id });
        };

        const onError = (error) => {
          this.log('error', `Resource ${resourceName}: error occurred`, { error: error.message });
        };

        // Adicionar listeners
        resource.on('s3db.insert', onInsert);
        resource.on('s3db.update', onUpdate);
        resource.on('s3db.delete', onDelete);
        resource.on('error', onError);

        listeners.push(
          { event: 's3db.insert', listener: onInsert },
          { event: 's3db.update', listener: onUpdate },
          { event: 's3db.delete', listener: onDelete },
          { event: 'error', listener: onError }
        );

        this.resourceListeners.set(resourceName, listeners);
      }

      log(level, message, metadata = {}) {
        const logEntry = {
          timestamp: new Date().toISOString(),
          level,
          message,
          metadata,
          plugin: 'logging'
        };
        
        this.logs.push(logEntry);
        
        if (this.config.console) {
          console.log(`[${level.toUpperCase()}] ${message}`, metadata);
        }
        
        this.emit('log', logEntry);
      }

      getLogs(level = null) {
        if (level) {
          return this.logs.filter(log => log.level === level);
        }
        return [...this.logs];
      }

      clearLogs() {
        this.logs = [];
      }
    }

    let database;
    let loggingPlugin;
    let pluginEvents;

    beforeEach(async () => {
      pluginEvents = [];
      loggingPlugin = new LoggingPlugin({ console: false });
      
      // Capturar eventos do plugin
      ['plugin.beforeSetup', 'plugin.afterSetup', 'plugin.beforeStart', 'plugin.afterStart', 'plugin.beforeStop', 'plugin.afterStop', 'log'].forEach(event => {
        loggingPlugin.on(event, (data) => {
          pluginEvents.push({ event, data, timestamp: Date.now() });
        });
      });

      // Mock database
      database = new Database({
        client: {
          bucket: 'test-bucket',
          keyPrefix: '',
          putObject: async () => ({}),
          getObject: async () => ({ Body: '{}' }),
          exists: async () => false
        },
        verbose: false,
        plugins: [loggingPlugin]
      });
    });

    test('Deve executar lifecycle completo do plugin', async () => {
      // Setup
      loggingPlugin.beforeSetup();
      await loggingPlugin.setup(database);
      loggingPlugin.afterSetup();

      expect(loggingPlugin.isSetup).toBe(true);
      expect(loggingPlugin.database).toBe(database);

      // Start
      loggingPlugin.beforeStart();
      await loggingPlugin.start();
      loggingPlugin.afterStart();

      expect(loggingPlugin.isStarted).toBe(true);

      // Stop
      loggingPlugin.beforeStop();
      await loggingPlugin.stop();
      loggingPlugin.afterStop();

      expect(loggingPlugin.isStarted).toBe(false);

      // Verificar eventos emitidos
      const eventTypes = pluginEvents.map(e => e.event);
      expect(eventTypes).toContain('plugin.beforeSetup');
      expect(eventTypes).toContain('plugin.afterSetup');
      expect(eventTypes).toContain('plugin.beforeStart');
      expect(eventTypes).toContain('plugin.afterStart');
      expect(eventTypes).toContain('plugin.beforeStop');
      expect(eventTypes).toContain('plugin.afterStop');
    });

    test('Deve capturar logs de operações de database', async () => {
      await loggingPlugin.setup(database);
      await loggingPlugin.start();

      // Simular criação de recurso
      database.emit('s3db.resourceCreated', 'users');
      database.emit('s3db.resourceUpdated', 'users');

      const logs = loggingPlugin.getLogs();
      expect(logs.length).toBeGreaterThan(0);

      const resourceLogs = logs.filter(log => log.message.includes('Resource'));
      expect(resourceLogs).toHaveLength(2);
      expect(resourceLogs[0].message).toContain('Resource created: users');
      expect(resourceLogs[1].message).toContain('Resource updated: users');
    });

    test('Deve rejeitar start sem setup', async () => {
      await expect(loggingPlugin.start()).rejects.toThrow('Plugin must be setup before starting');
    });

    test('Deve limpar recursos ao parar', async () => {
      // Setup e start
      await loggingPlugin.setup(database);
      await loggingPlugin.start();

      // Adicionar alguns listeners
      database.emit('s3db.resourceCreated', 'products');
      expect(loggingPlugin.resourceListeners.size).toBe(1);

      // Stop
      await loggingPlugin.stop();
      expect(loggingPlugin.resourceListeners.size).toBe(0);
    });
  });

  describe('Cenário 2: Plugin de métricas e monitoramento', () => {
    class MetricsPlugin extends Plugin {
      constructor() {
        super();
        this.metrics = {
          operations: 0,
          errors: 0,
          resourceCounts: {},
          startTime: null,
          uptime: 0
        };
        this.intervals = [];
      }

      async setup(database) {
        this.database = database;
        
        // Monitorar operações
        database.on('s3db.resourceCreated', () => {
          this.metrics.operations++;
        });

        database.on('s3db.resourceUpdated', () => {
          this.metrics.operations++;
        });
      }

      async start() {
        this.metrics.startTime = Date.now();
        
        // Atualizar uptime a cada segundo
        const uptimeInterval = setInterval(() => {
          if (this.metrics.startTime) {
            this.metrics.uptime = Date.now() - this.metrics.startTime;
          }
        }, 1000);
        
        this.intervals.push(uptimeInterval);
        
        // Coletar métricas de recursos a cada 5 segundos
        const resourcesInterval = setInterval(() => {
          this.collectResourceMetrics();
        }, 5000);
        
        this.intervals.push(resourcesInterval);
      }

      async stop() {
        // Limpar intervals
        this.intervals.forEach(interval => clearInterval(interval));
        this.intervals = [];
        
        this.metrics.startTime = null;
        this.metrics.uptime = 0;
      }

      collectResourceMetrics() {
        if (this.database && this.database.resources) {
          this.metrics.resourceCounts = {};
          Object.entries(this.database.resources).forEach(([name, resource]) => {
            this.metrics.resourceCounts[name] = {
              name,
              version: resource.version,
              hasPartitions: Object.keys(resource.partitions || {}).length > 0
            };
          });
        }
      }

      getMetrics() {
        return { ...this.metrics };
      }

      resetMetrics() {
        this.metrics = {
          operations: 0,
          errors: 0,
          resourceCounts: {},
          startTime: this.metrics.startTime,
          uptime: this.metrics.uptime
        };
      }
    }

    let metricsPlugin;

    beforeEach(() => {
      metricsPlugin = new MetricsPlugin();
    });

    afterEach(async () => {
      await metricsPlugin.stop();
    });

    test('Deve coletar métricas básicas', async () => {
      const mockDatabase = new EventEmitter();
      mockDatabase.resources = {
        users: { version: 'v1', partitions: { byRole: {} } },
        products: { version: 'v2', partitions: {} }
      };

      await metricsPlugin.setup(mockDatabase);
      await metricsPlugin.start();

      // Simular operações
      mockDatabase.emit('s3db.resourceCreated');
      mockDatabase.emit('s3db.resourceUpdated');
      mockDatabase.emit('s3db.resourceCreated');

      const metrics = metricsPlugin.getMetrics();
      expect(metrics.operations).toBe(3);
      expect(metrics.startTime).toBeDefined();
      expect(metrics.uptime).toBeGreaterThan(0);
    });

    test('Deve coletar métricas de recursos', async () => {
      const mockDatabase = {
        resources: {
          users: { version: 'v1', partitions: { byRole: {} } },
          products: { version: 'v2', partitions: {} }
        }
      };

      await metricsPlugin.setup(mockDatabase);
      await metricsPlugin.start();

      metricsPlugin.collectResourceMetrics();

      const metrics = metricsPlugin.getMetrics();
      expect(metrics.resourceCounts).toHaveProperty('users');
      expect(metrics.resourceCounts).toHaveProperty('products');
      expect(metrics.resourceCounts.users.version).toBe('v1');
      expect(metrics.resourceCounts.users.hasPartitions).toBe(true);
      expect(metrics.resourceCounts.products.hasPartitions).toBe(false);
    });

    test('Deve resetar métricas corretamente', async () => {
      const mockDatabase = new EventEmitter();
      await metricsPlugin.setup(mockDatabase);
      await metricsPlugin.start();

      // Gerar algumas métricas
      mockDatabase.emit('s3db.resourceCreated');
      mockDatabase.emit('s3db.resourceUpdated');

      expect(metricsPlugin.getMetrics().operations).toBe(2);

      // Reset
      metricsPlugin.resetMetrics();
      
      const metrics = metricsPlugin.getMetrics();
      expect(metrics.operations).toBe(0);
      expect(metrics.errors).toBe(0);
      expect(metrics.resourceCounts).toEqual({});
    });
  });

  describe('Cenário 3: Plugin de cache distribuído', () => {
    class CachePlugin extends Plugin {
      constructor(config = {}) {
        super();
        this.config = config;
        this.cache = new Map();
        this.ttlTimers = new Map();
        this.defaultTTL = config.ttl || 300000; // 5 minutos
        this.hitCount = 0;
        this.missCount = 0;
      }

      async setup(database) {
        this.database = database;
        
        // Interceptar operações de leitura
        Object.values(database.resources || {}).forEach(resource => {
          this.setupResourceCaching(resource);
        });

        // Setup para novos recursos
        database.on('s3db.resourceCreated', (resourceName) => {
          const resource = database.resources[resourceName];
          if (resource) {
            this.setupResourceCaching(resource);
          }
        });
      }

      async start() {
        // Iniciar limpeza periódica de cache
        this.cleanupInterval = setInterval(() => {
          this.cleanExpired();
        }, 60000); // 1 minuto
      }

      async stop() {
        // Limpar interval
        if (this.cleanupInterval) {
          clearInterval(this.cleanupInterval);
        }
        
        // Limpar todos os timers TTL
        for (const timer of this.ttlTimers.values()) {
          clearTimeout(timer);
        }
        
        this.cache.clear();
        this.ttlTimers.clear();
      }

      setupResourceCaching(resource) {
        // Cache gets
        const originalGet = resource.get?.bind(resource);
        if (originalGet) {
          resource.get = async (id, options = {}) => {
            const cacheKey = `${resource.name}:${id}`;
            
            if (!options.bypassCache) {
              const cached = this.getCached(cacheKey);
              if (cached !== null) {
                this.hitCount++;
                return cached;
              }
            }
            
            this.missCount++;
            const result = await originalGet(id, options);
            
            if (result && !options.bypassCache) {
              this.setCached(cacheKey, result);
            }
            
            return result;
          };
        }

        // Invalidar cache em updates
        const originalUpdate = resource.update?.bind(resource);
        if (originalUpdate) {
          resource.update = async (id, data, options = {}) => {
            const result = await originalUpdate(id, data, options);
            const cacheKey = `${resource.name}:${id}`;
            this.invalidate(cacheKey);
            return result;
          };
        }

        // Invalidar cache em deletes
        const originalDelete = resource.delete?.bind(resource);
        if (originalDelete) {
          resource.delete = async (id, options = {}) => {
            const result = await originalDelete(id, options);
            const cacheKey = `${resource.name}:${id}`;
            this.invalidate(cacheKey);
            return result;
          };
        }
      }

      getCached(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        // Verificar TTL
        if (Date.now() > item.expiresAt) {
          this.invalidate(key);
          return null;
        }

        return item.data;
      }

      setCached(key, data, ttl = this.defaultTTL) {
        const expiresAt = Date.now() + ttl;
        
        this.cache.set(key, {
          data: JSON.parse(JSON.stringify(data)), // Deep clone
          expiresAt,
          createdAt: Date.now()
        });

        // Setup TTL timer
        const timer = setTimeout(() => {
          this.invalidate(key);
        }, ttl);

        this.ttlTimers.set(key, timer);
      }

      invalidate(key) {
        this.cache.delete(key);
        
        const timer = this.ttlTimers.get(key);
        if (timer) {
          clearTimeout(timer);
          this.ttlTimers.delete(key);
        }
      }

      cleanExpired() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
          if (now > item.expiresAt) {
            this.invalidate(key);
          }
        }
      }

      getStats() {
        return {
          size: this.cache.size,
          hitCount: this.hitCount,
          missCount: this.missCount,
          hitRate: this.hitCount / (this.hitCount + this.missCount) || 0,
          timers: this.ttlTimers.size
        };
      }
    }

    let cachePlugin;

    beforeEach(() => {
      cachePlugin = new CachePlugin({ ttl: 100 }); // 100ms TTL para testes
    });

    afterEach(async () => {
      await cachePlugin.stop();
    });

    test('Deve implementar cache básico com TTL', async () => {
      const mockDatabase = {
        resources: {},
        on: () => {}
      };

      await cachePlugin.setup(mockDatabase);
      await cachePlugin.start();

      // Testar cache manual
      cachePlugin.setCached('test:key', { data: 'test value' });
      
      let cached = cachePlugin.getCached('test:key');
      expect(cached).toEqual({ data: 'test value' });

      // Aguardar expiração
      await new Promise(resolve => setTimeout(resolve, 150));
      
      cached = cachePlugin.getCached('test:key');
      expect(cached).toBeNull();
    });

    test('Deve calcular estatísticas de hit rate', async () => {
      const mockDatabase = {
        resources: {},
        on: () => {}
      };

      await cachePlugin.setup(mockDatabase);

      // Simular hits e misses
      cachePlugin.hitCount = 80;
      cachePlugin.missCount = 20;

      const stats = cachePlugin.getStats();
      expect(stats.hitRate).toBe(0.8); // 80%
      expect(stats.hitCount).toBe(80);
      expect(stats.missCount).toBe(20);
    });
  });

  describe('Cenário 4: Múltiplos plugins trabalhando juntos', () => {
    class SimplePlugin extends Plugin {
      constructor(name) {
        super();
        this.name = name;
        this.lifecycle = [];
      }

      async setup(database) {
        this.lifecycle.push('setup');
        this.database = database;
      }

      async start() {
        this.lifecycle.push('start');
      }

      async stop() {
        this.lifecycle.push('stop');
      }
    }

    test('Deve gerenciar múltiplos plugins simultaneamente', async () => {
      const plugin1 = new SimplePlugin('plugin1');
      const plugin2 = new SimplePlugin('plugin2');
      const plugin3 = new SimplePlugin('plugin3');

      const plugins = [plugin1, plugin2, plugin3];
      const mockDatabase = { resources: {}, on: () => {} };

      // Setup de todos os plugins
      for (const plugin of plugins) {
        plugin.beforeSetup();
        await plugin.setup(mockDatabase);
        plugin.afterSetup();
      }

      // Start de todos os plugins
      for (const plugin of plugins) {
        plugin.beforeStart();
        await plugin.start();
        plugin.afterStart();
      }

      // Verificar que todos foram configurados
      plugins.forEach(plugin => {
        expect(plugin.lifecycle).toContain('setup');
        expect(plugin.lifecycle).toContain('start');
        expect(plugin.database).toBe(mockDatabase);
      });

      // Stop de todos os plugins
      for (const plugin of plugins) {
        plugin.beforeStop();
        await plugin.stop();
        plugin.afterStop();
      }

      plugins.forEach(plugin => {
        expect(plugin.lifecycle).toContain('stop');
      });
    });

    test('Deve herdar corretamente de EventEmitter', () => {
      const plugin = new SimplePlugin('test');
      
      expect(plugin).toBeInstanceOf(EventEmitter);
      expect(typeof plugin.on).toBe('function');
      expect(typeof plugin.emit).toBe('function');
      expect(typeof plugin.removeAllListeners).toBe('function');
    });
  });
});