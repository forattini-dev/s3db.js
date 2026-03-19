import { InMemoryPersistence, PartitionQueue } from '../../src/concerns/partition-queue.js';

describe('PartitionQueue', () => {
  it('stores queue item createdAt as ISO string', async () => {
    const persistence = new InMemoryPersistence();
    const queue = new PartitionQueue({ persistence });

    await queue.enqueue({
      type: 'create',
      resource: {
        createPartitionReferences: vi.fn().mockResolvedValue(undefined),
        handlePartitionReferenceUpdates: vi.fn().mockResolvedValue(undefined),
        deletePartitionReferences: vi.fn().mockResolvedValue(undefined)
      },
      data: { id: 'rec-1' }
    });

    const pending = await persistence.getPending();

    expect(pending).toHaveLength(1);
    expect(typeof pending[0].createdAt).toBe('string');
    expect(Number.isFinite(Date.parse(pending[0].createdAt))).toBe(true);
  });
});
