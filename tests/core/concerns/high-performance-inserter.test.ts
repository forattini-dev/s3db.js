import { describe, expect, it, vi } from 'vitest';

import { HighPerformanceInserter } from '../../../src/concerns/high-performance-inserter.js';

function createMockResource(overrides: Record<string, unknown> = {}) {
  return {
    config: {
      asyncPartitions: false,
      partitions: {
        byStatus: {
          fields: {
            status: 'string'
          }
        }
      }
    },
    insert: vi.fn(async (data: Record<string, unknown>) => data),
    insertMany: vi.fn(async (items: Record<string, unknown>[]) => items),
    createPartitionReferences: vi.fn(async () => undefined),
    emit: vi.fn(),
    generateId: vi.fn(() => 'generated-id'),
    getResourceKey: vi.fn((id: string) => `resource=test/data/id=${id}`),
    schema: {
      mapper: vi.fn(async (data: Record<string, unknown>) => data)
    },
    client: {
      config: { bucket: 'test' },
      client: {
        send: vi.fn()
      }
    },
    ...overrides
  };
}

describe('HighPerformanceInserter', () => {
  it('uses insertMany() when available and does not manually recreate partitions', async () => {
    const resource = createMockResource();
    const inserter = new HighPerformanceInserter(resource as any, {
      batchSize: 3,
      flushInterval: 60_000
    });

    await inserter.add({ id: 'a1', status: 'active' });
    await inserter.add({ id: 'a2', status: 'active' });
    await inserter.add({ id: 'a3', status: 'inactive' });
    await inserter.forceFlush();

    expect(resource.insertMany).toHaveBeenCalledTimes(1);
    expect(resource.insertMany).toHaveBeenCalledWith([
      { id: 'a1', status: 'active' },
      { id: 'a2', status: 'active' },
      { id: 'a3', status: 'inactive' }
    ]);
    expect(resource.insert).not.toHaveBeenCalled();
    expect(resource.createPartitionReferences).not.toHaveBeenCalled();
    expect(inserter.getStats().inserted).toBe(3);
    expect(inserter.getStats().failed).toBe(0);
    expect(inserter.getStats().partitionsPending).toBe(0);
  });

  it('restores partition config when a disabled-partition insert fails', async () => {
    const originalPartitions = {
      byStatus: {
        fields: {
          status: 'string'
        }
      }
    };
    const resource = createMockResource({
      config: {
        asyncPartitions: true,
        partitions: originalPartitions
      },
      insertMany: undefined,
      insert: vi.fn(async () => {
        throw new Error('insert failed');
      })
    });
    const inserter = new HighPerformanceInserter(resource as any, {
      disablePartitions: true
    });

    const result = await inserter.performInsert({
      data: { id: 'x1', status: 'active' },
      timestamp: Date.now(),
      promise: null
    });

    expect(result.success).toBe(false);
    expect(resource.config.partitions).toBe(originalPartitions);
    expect(resource.config.asyncPartitions).toBe(true);
  });

  it('falls back to per-item inserts when insertMany() is unavailable', async () => {
    const resource = createMockResource({
      insertMany: undefined
    });
    const inserter = new HighPerformanceInserter(resource as any, {
      batchSize: 2,
      flushInterval: 60_000
    });

    await inserter.add({ id: 'b1', status: 'active' });
    await inserter.add({ id: 'b2', status: 'inactive' });
    await inserter.forceFlush();

    expect(resource.insert).toHaveBeenCalledTimes(2);
    expect(resource.createPartitionReferences).not.toHaveBeenCalled();
    expect(inserter.getStats().inserted).toBe(2);
    expect(inserter.getStats().failed).toBe(0);
  });
});
