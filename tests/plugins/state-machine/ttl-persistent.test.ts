import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine/index.js';

function createSessionMachine(ttlDuration = '50ms') {
  return {
    initialState: 'idle',
    states: {
      idle: {
        on: { START: 'active' }
      },
      active: {
        on: { EXPIRE: 'expired', RENEW: 'idle' },
        ttl: { after: ttlDuration, send: 'EXPIRE' }
      },
      expired: { type: 'final' as const }
    }
  };
}

describe('StateMachinePlugin - Persistent TTL', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/state-machine-ttl-persistent');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should persist _ttlExpiresAt and _ttlEvent in state record', async () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: { session: createSessionMachine('5m') },
      persistTransitions: true,
      ttlCheckInterval: 600000
    });

    await plugin.install(database);
    await plugin.initializeEntity('session', 'ent-1', { id: 'ent-1' });
    await plugin.send('session', 'ent-1', 'START');

    const stateResource = database.resources[plugin.config.stateResource];
    const record = await stateResource.get('session_ent-1');

    expect(record._ttlExpiresAt).toBeDefined();
    expect(record._ttlExpiresAt).not.toBeNull();
    expect(record._ttlEvent).toBe('EXPIRE');

    const expiresAt = new Date(record._ttlExpiresAt).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 300000 + 1000);

    await plugin.stop();
  });

  it('should clear _ttlExpiresAt when transitioning to non-TTL state', async () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: { session: createSessionMachine('5m') },
      persistTransitions: true,
      ttlCheckInterval: 600000
    });

    await plugin.install(database);
    await plugin.initializeEntity('session', 'ent-2', { id: 'ent-2' });
    await plugin.send('session', 'ent-2', 'START');

    let record = await database.resources[plugin.config.stateResource].get('session_ent-2');
    expect(record._ttlExpiresAt).not.toBeNull();

    await plugin.send('session', 'ent-2', 'RENEW');

    record = await database.resources[plugin.config.stateResource].get('session_ent-2');
    expect(record._ttlExpiresAt).toBeNull();
    expect(record._ttlEvent).toBeNull();

    await plugin.stop();
  });

  it('should register TTL in _ttlRegistry when persistTransitions is true', async () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: { session: createSessionMachine('5m') },
      persistTransitions: true,
      ttlCheckInterval: 600000
    });

    await plugin.install(database);
    await plugin.initializeEntity('session', 'ent-3', { id: 'ent-3' });
    await plugin.send('session', 'ent-3', 'START');

    expect(plugin._ttlRegistry.size).toBe(1);
    const entry = plugin._ttlRegistry.get('session:ent-3');
    expect(entry).toBeDefined();
    expect(entry!.machineId).toBe('session');
    expect(entry!.entityId).toBe('ent-3');
    expect(entry!.event).toBe('EXPIRE');
    expect(entry!.expiresAt).toBeGreaterThan(Date.now());

    expect(plugin._ttlTimers.size).toBe(0);

    await plugin.stop();
  });

  it('should remove from _ttlRegistry when transitioning away', async () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: { session: createSessionMachine('5m') },
      persistTransitions: true,
      ttlCheckInterval: 600000
    });

    await plugin.install(database);
    await plugin.initializeEntity('session', 'ent-4', { id: 'ent-4' });
    await plugin.send('session', 'ent-4', 'START');
    expect(plugin._ttlRegistry.size).toBe(1);

    await plugin.send('session', 'ent-4', 'RENEW');
    expect(plugin._ttlRegistry.size).toBe(0);

    await plugin.stop();
  });

  it('should recover TTLs from storage on startup', async () => {
    const plugin1 = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: { session: createSessionMachine('10m') },
      persistTransitions: true,
      ttlCheckInterval: 600000
    });

    await plugin1.install(database);
    await plugin1.initializeEntity('session', 'ent-5', { id: 'ent-5' });
    await plugin1.send('session', 'ent-5', 'START');

    expect(plugin1._ttlRegistry.size).toBe(1);
    await plugin1.stop();

    const plugin2 = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: { session: createSessionMachine('10m') },
      persistTransitions: true,
      ttlCheckInterval: 600000
    });

    await plugin2.install(database);

    expect(plugin2._ttlRegistry.size).toBe(1);
    const entry = plugin2._ttlRegistry.get('session:ent-5');
    expect(entry).toBeDefined();
    expect(entry!.event).toBe('EXPIRE');
    expect(entry!.expiresAt).toBeGreaterThan(Date.now());

    await plugin2.stop();
  });

  it('should fire expired TTLs via poll', async () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: { session: createSessionMachine('50ms') },
      persistTransitions: true,
      ttlCheckInterval: 50
    });

    await plugin.install(database);
    await plugin.initializeEntity('session', 'ent-6', { id: 'ent-6' });
    await plugin.send('session', 'ent-6', 'START');

    expect(await plugin.getState('session', 'ent-6')).toBe('active');

    await vi.waitFor(async () => {
      const state = await plugin.getState('session', 'ent-6');
      expect(state).toBe('expired');
    }, {
      timeout: 3000,
      interval: 25
    });

    expect(plugin._ttlRegistry.size).toBe(0);

    await plugin.stop();
  });

  it('should handle pre-upgrade records without _ttlExpiresAt on recovery', async () => {
    const plugin1 = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: { session: createSessionMachine('5m') },
      persistTransitions: true,
      ttlCheckInterval: 600000
    });

    await plugin1.install(database);
    await plugin1.initializeEntity('session', 'ent-7', { id: 'ent-7' });
    await plugin1.send('session', 'ent-7', 'START');

    const stateResource = database.resources[plugin1.config.stateResource];
    await stateResource.update('session_ent-7', { _ttlExpiresAt: null, _ttlEvent: null });

    await plugin1.stop();

    const plugin2 = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: { session: createSessionMachine('5m') },
      persistTransitions: true,
      ttlCheckInterval: 600000
    });

    await plugin2.install(database);

    expect(plugin2._ttlRegistry.size).toBe(1);
    const entry = plugin2._ttlRegistry.get('session:ent-7');
    expect(entry).toBeDefined();
    expect(entry!.event).toBe('EXPIRE');
    expect(entry!.expiresAt).toBeGreaterThan(Date.now());

    await plugin2.stop();
  });

  it('should clear _ttlRegistry on stop()', async () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: { session: createSessionMachine('5m') },
      persistTransitions: true,
      ttlCheckInterval: 600000
    });

    await plugin.install(database);
    await plugin.initializeEntity('session', 'ent-8', { id: 'ent-8' });
    await plugin.send('session', 'ent-8', 'START');
    expect(plugin._ttlRegistry.size).toBe(1);

    await plugin.stop();
    expect(plugin._ttlRegistry.size).toBe(0);
  });

  it('should cancel TTL on deleteEntity', async () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: { session: createSessionMachine('5m') },
      persistTransitions: true,
      ttlCheckInterval: 600000
    });

    await plugin.install(database);
    await plugin.initializeEntity('session', 'ent-9', { id: 'ent-9' });
    await plugin.send('session', 'ent-9', 'START');
    expect(plugin._ttlRegistry.size).toBe(1);

    await plugin.deleteEntity('session', 'ent-9');
    expect(plugin._ttlRegistry.size).toBe(0);

    await plugin.stop();
  });

  it('should schedule TTL for initial state with TTL config', async () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        auto: {
          initialState: 'waiting',
          states: {
            waiting: {
              on: { TIMEOUT: 'timedout', ACK: 'acknowledged' },
              ttl: { after: '5m', send: 'TIMEOUT' }
            },
            acknowledged: { type: 'final' },
            timedout: { type: 'final' }
          }
        }
      },
      persistTransitions: true,
      ttlCheckInterval: 600000
    });

    await plugin.install(database);
    await plugin.initializeEntity('auto', 'ent-10', { id: 'ent-10' });

    expect(plugin._ttlRegistry.size).toBe(1);
    const entry = plugin._ttlRegistry.get('auto:ent-10');
    expect(entry).toBeDefined();
    expect(entry!.event).toBe('TIMEOUT');

    const stateResource = database.resources[plugin.config.stateResource];
    const record = await stateResource.get('auto_ent-10');
    expect(record._ttlExpiresAt).not.toBeNull();
    expect(record._ttlEvent).toBe('TIMEOUT');

    await plugin.stop();
  });

  it('should use setTimeout when persistTransitions is false (backward compat)', async () => {
    vi.useFakeTimers();

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: { session: createSessionMachine('200ms') },
      persistTransitions: false
    });

    await plugin.install(database);
    await plugin.initializeEntity('session', 'ent-bc', { id: 'ent-bc' });
    await plugin.send('session', 'ent-bc', 'START');

    expect(plugin._ttlTimers.size).toBe(1);
    expect(plugin._ttlRegistry.size).toBe(0);

    await plugin.stop();
    vi.useRealTimers();
  });

  it('should fire multiple expired TTLs in the same poll cycle', async () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: { session: createSessionMachine('50ms') },
      persistTransitions: true,
      ttlCheckInterval: 50
    });

    await plugin.install(database);

    await plugin.initializeEntity('session', 'a', { id: 'a' });
    await plugin.initializeEntity('session', 'b', { id: 'b' });
    await plugin.initializeEntity('session', 'c', { id: 'c' });

    await plugin.send('session', 'a', 'START');
    await plugin.send('session', 'b', 'START');
    await plugin.send('session', 'c', 'START');

    expect(plugin._ttlRegistry.size).toBe(3);

    await vi.waitFor(async () => {
      const stateA = await plugin.getState('session', 'a');
      const stateB = await plugin.getState('session', 'b');
      const stateC = await plugin.getState('session', 'c');
      expect(stateA).toBe('expired');
      expect(stateB).toBe('expired');
      expect(stateC).toBe('expired');
    }, {
      timeout: 3000,
      interval: 25
    });

    expect(plugin._ttlRegistry.size).toBe(0);
    await plugin.stop();
  });

  it('should handle chained TTL states (A → ttl → B → ttl → C)', async () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        pipeline: {
          initialState: 'idle',
          states: {
            idle: { on: { START: 'step1' } },
            step1: {
              on: { TIMEOUT_1: 'step2' },
              ttl: { after: '50ms', send: 'TIMEOUT_1' }
            },
            step2: {
              on: { TIMEOUT_2: 'done' },
              ttl: { after: '50ms', send: 'TIMEOUT_2' }
            },
            done: { type: 'final' }
          }
        }
      },
      persistTransitions: true,
      ttlCheckInterval: 30
    });

    await plugin.install(database);
    await plugin.initializeEntity('pipeline', 'chain-1', { id: 'chain-1' });
    await plugin.send('pipeline', 'chain-1', 'START');

    expect(await plugin.getState('pipeline', 'chain-1')).toBe('step1');

    await vi.waitFor(async () => {
      const state = await plugin.getState('pipeline', 'chain-1');
      expect(state).toBe('done');
    }, {
      timeout: 5000,
      interval: 25
    });

    expect(plugin._ttlRegistry.size).toBe(0);
    await plugin.stop();
  });
});
