import { createDatabaseForTest } from '../../config.js';
import { StateMachinePlugin } from '../../../src/plugins/state-machine.plugin.js';

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

describe('StateMachinePlugin - Transition Queries and Snapshot', () => {
  let database;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/state-machine-transitions-snapshot');
    await database.connect();

    plugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        order_flow: {
          initialState: 'pending',
          states: {
            pending: { on: { START: 'processing' } },
            processing: {
              on: {
                TICK: 'processing',
                FINISH: 'finished'
              }
            },
            finished: { type: 'final' }
          }
        }
      },
      persistTransitions: true
    });

    await plugin.install(database);
    await plugin.initializeEntity('order_flow', 'order-1');

    await plugin.send('order_flow', 'order-1', 'START', { step: 'start' });
    await plugin.send('order_flow', 'order-1', 'TICK', { step: 'tick-1' });
    await sleep(2);
    await plugin.send('order_flow', 'order-1', 'TICK', { step: 'tick-2' });
    await sleep(2);
    await plugin.send('order_flow', 'order-1', 'FINISH', { step: 'finish' });
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should list transitions with pagination, ordering, and filters', async () => {
    const allDesc = await plugin.getTransitions('order_flow', 'order-1', {
      sort: 'desc'
    });

    expect(allDesc).toHaveLength(4);
    expect(allDesc[0].event).toBe('FINISH');
    expect(allDesc[allDesc.length - 1].event).toBe('START');

    const allAsc = await plugin.getTransitions('order_flow', 'order-1', {
      sort: 'asc'
    });

    expect(allAsc[0].event).toBe('START');
    expect(allAsc[allAsc.length - 1].event).toBe('FINISH');

    const paginated = await plugin.getTransitions('order_flow', 'order-1', {
      sort: 'desc',
      limit: 2,
      offset: 1
    });

    expect(paginated).toHaveLength(2);
    expect(paginated[0].event).toBe('TICK');
    expect(paginated[1].event).toBe('TICK');

    const tickOnly = await plugin.getTransitions('order_flow', 'order-1', {
      event: 'TICK'
    });

    expect(tickOnly).toHaveLength(2);
    expect(tickOnly.every((transition) => transition.event === 'TICK')).toBe(true);
  });

  it('should filter transition history by fromState and toState', async () => {
    const fromPending = await plugin.getTransitions('order_flow', 'order-1', {
      fromState: 'pending'
    });
    expect(fromPending).toHaveLength(1);
    expect(fromPending[0].from).toBe('pending');

    const toFinished = await plugin.getTransitions('order_flow', 'order-1', {
      toState: 'finished'
    });
    expect(toFinished).toHaveLength(1);
    expect(toFinished[0].to).toBe('finished');
  });

  it('should filter transitions by from and to timestamps', async () => {
    const history = await plugin.getTransitions('order_flow', 'order-1', {
      sort: 'asc'
    });
    expect(history).toHaveLength(4);

    const toFromTs = history[0].timestamp;
    const toTs = history[history.length - 1].timestamp;
    const middleOnly = await plugin.getTransitions('order_flow', 'order-1', {
      from: toFromTs,
      to: toTs
    });

    expect(middleOnly.length).toBeLessThanOrEqual(4);
    expect(middleOnly.length).toBeGreaterThan(0);
  });

  it('should return transition count with filters', async () => {
    const total = await plugin.getTransitionCount('order_flow', 'order-1');
    const onlyFinish = await plugin.getTransitionCount('order_flow', 'order-1', {
      event: 'FINISH'
    });
    const fromPending = await plugin.getTransitionCount('order_flow', 'order-1', {
      fromState: 'processing'
    });

    expect(total).toBe(4);
    expect(onlyFinish).toBe(1);
    expect(fromPending).toBe(3);
  });

  it('should fetch persisted snapshot for entity', async () => {
    const snapshot = await plugin.getSnapshot('order_flow', 'order-1');

    expect(snapshot).toMatchObject({
      machineId: 'order_flow',
      entityId: 'order-1',
      state: 'finished',
      stateVersion: 4,
      persisted: true
    });
    expect(snapshot.lastTransition).toEqual(expect.any(String));
    expect(snapshot.context).toMatchObject({ step: 'finish' });
  });

  it('should fetch transition by id or return null when not found', async () => {
    const transitionLog = database.resources[plugin.config.transitionLogResource];
    const transitionRecords = await transitionLog.query(
      {},
      {
        limit: 1,
        offset: 0,
        partition: 'byMachineEntity',
        partitionValues: {
          machineId: 'order_flow',
          entityId: 'order-1'
        },
      }
    );

    expect(transitionRecords).toHaveLength(1);

    const transitionId = transitionRecords[0]?.id;

    expect(transitionId).toBeDefined();

    const transition = await plugin.getTransition('order_flow', 'order-1', transitionId);
    expect(transition).toMatchObject({
      machineId: 'order_flow',
      entityId: 'order-1'
    });

    const missingByEntity = await plugin.getTransition('order_flow', 'order-2', transitionId);
    expect(missingByEntity).toBeNull();

    const missingTransition = await plugin.getTransition('order_flow', 'order-1', 'missing-transition');
    expect(missingTransition).toBeNull();
  });

  it('should return non-persisted snapshot when state persistence is disabled', async () => {
    const inMemoryPlugin = new StateMachinePlugin({
      logLevel: 'silent',
      stateMachines: {
        flow: {
          initialState: 'open',
          states: {
            open: {
              on: {
                CLOSE: 'closed'
              }
            },
            closed: {
              type: 'final'
            }
          }
        }
      },
      persistTransitions: false
    });

    await inMemoryPlugin.install(database);
    await inMemoryPlugin.initializeEntity('flow', 'ticket-1');
    await inMemoryPlugin.send('flow', 'ticket-1', 'CLOSE');

    const snapshot = await inMemoryPlugin.getSnapshot('flow', 'ticket-1');

    expect(snapshot).toMatchObject({
      machineId: 'flow',
      entityId: 'ticket-1',
      state: 'closed',
      stateVersion: 1,
      persisted: false
    });
  });
});
