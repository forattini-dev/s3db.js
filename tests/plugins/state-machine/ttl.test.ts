import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine/index.js';
import { parseDuration } from '../../../src/plugins/state-machine/helpers.js';

describe('StateMachinePlugin - State TTL', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/state-machine-ttl');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should auto-send event when TTL timer fires', async () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        session: {
          initialState: 'idle',
          states: {
            idle: {
              on: { START: 'active' }
            },
            active: {
              on: { EXPIRE: 'expired' },
              ttl: { after: '50ms', send: 'EXPIRE' }
            },
            expired: { type: 'final' }
          }
        }
      },
      persistTransitions: false
    });

    await plugin.install(database);
    await plugin.initializeEntity('session', 'sess-1', { id: 'sess-1' });

    await plugin.send('session', 'sess-1', 'START');
    expect(await plugin.getState('session', 'sess-1')).toBe('active');

    await vi.waitFor(async () => {
      const state = await plugin.getState('session', 'sess-1');
      expect(state).toBe('expired');
    }, {
      timeout: 1500,
      interval: 25
    });

    await plugin.stop();
  });

  it('should cancel TTL timer when entity transitions out before expiry', async () => {
    vi.useFakeTimers();

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        session: {
          initialState: 'idle',
          states: {
            idle: {
              on: { START: 'active' }
            },
            active: {
              on: { EXPIRE: 'expired', RENEW: 'renewed' },
              ttl: { after: '200ms', send: 'EXPIRE' }
            },
            renewed: { type: 'final' },
            expired: { type: 'final' }
          }
        }
      },
      persistTransitions: false
    });

    await plugin.install(database);
    await plugin.initializeEntity('session', 'sess-2', { id: 'sess-2' });

    await plugin.send('session', 'sess-2', 'START');
    expect(await plugin.getState('session', 'sess-2')).toBe('active');

    await vi.advanceTimersByTimeAsync(50);
    await plugin.send('session', 'sess-2', 'RENEW');
    expect(await plugin.getState('session', 'sess-2')).toBe('renewed');

    expect(plugin._ttlTimers.size).toBe(0);

    await vi.advanceTimersByTimeAsync(300);
    expect(await plugin.getState('session', 'sess-2')).toBe('renewed');

    await plugin.stop();
    vi.useRealTimers();
  });

  it('should swallow errors when TTL fires for entity that already left the state', async () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        workflow: {
          initialState: 'pending',
          states: {
            pending: {
              on: { APPROVE: 'review' }
            },
            review: {
              on: { TIMEOUT: 'escalated', COMPLETE: 'done' },
              ttl: { after: '50ms', send: 'TIMEOUT' }
            },
            escalated: { type: 'final' },
            done: {
              type: 'final',
              on: {}
            }
          }
        }
      },
      persistTransitions: false
    });

    await plugin.install(database);
    await plugin.initializeEntity('workflow', 'wf-1', { id: 'wf-1' });

    await plugin.send('workflow', 'wf-1', 'APPROVE');
    expect(await plugin.getState('workflow', 'wf-1')).toBe('review');

    await plugin.send('workflow', 'wf-1', 'COMPLETE');
    expect(await plugin.getState('workflow', 'wf-1')).toBe('done');

    await new Promise(resolve => setTimeout(resolve, 120));

    expect(await plugin.getState('workflow', 'wf-1')).toBe('done');

    await plugin.stop();
  });

  it('should not schedule TTL timers for machines without TTL states', async () => {
    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        simple: {
          initialState: 'start',
          states: {
            start: { on: { GO: 'end' } },
            end: { type: 'final' }
          }
        }
      },
      persistTransitions: false
    });

    await plugin.install(database);
    await plugin.initializeEntity('simple', 'ent-1', { id: 'ent-1' });

    expect(plugin.hasTTLStates('simple')).toBe(false);

    await plugin.send('simple', 'ent-1', 'GO');
    expect(plugin._ttlTimers.size).toBe(0);

    await plugin.stop();
  });

  it('should clear all TTL timers on stop()', async () => {
    vi.useFakeTimers();

    const plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        session: {
          initialState: 'idle',
          states: {
            idle: {
              on: { START: 'active' }
            },
            active: {
              on: { EXPIRE: 'expired' },
              ttl: { after: '5000ms', send: 'EXPIRE' }
            },
            expired: { type: 'final' }
          }
        }
      },
      persistTransitions: false
    });

    await plugin.install(database);
    await plugin.initializeEntity('session', 'sess-stop', { id: 'sess-stop' });

    await plugin.send('session', 'sess-stop', 'START');
    expect(await plugin.getState('session', 'sess-stop')).toBe('active');
    expect(plugin._ttlTimers.size).toBe(1);

    await plugin.stop();
    expect(plugin._ttlTimers.size).toBe(0);

    await vi.advanceTimersByTimeAsync(6000);

    vi.useRealTimers();
  });
});

describe('parseDuration', () => {
  it('should parse milliseconds', () => {
    expect(parseDuration('500ms')).toBe(500);
  });

  it('should parse seconds', () => {
    expect(parseDuration('30s')).toBe(30000);
  });

  it('should parse minutes', () => {
    expect(parseDuration('5m')).toBe(300000);
  });

  it('should parse hours', () => {
    expect(parseDuration('2h')).toBe(7200000);
  });

  it('should parse days', () => {
    expect(parseDuration('1d')).toBe(86400000);
  });

  it('should treat plain number string as raw milliseconds', () => {
    expect(parseDuration('500')).toBe(500);
  });

  it('should pass through numeric values unchanged', () => {
    expect(parseDuration(1234)).toBe(1234);
  });
});
