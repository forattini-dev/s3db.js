import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createDatabaseForTest } from '#tests/config.js';

describe('Resource Partition Auto-Move - Edge Cases', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('resource-partition-edge-cases');
    await database.connect();
  });

  test('should handle moving between multiple partitions simultaneously', async () => {
    const resource = await database.createResource({
      name: 'products',
      asyncPartitions: false,
      attributes: {
        id: 'string|required',
        name: 'string|required',
        category: 'string|required',
        status: 'string|required',
        region: 'string|required'
      },
      partitions: {
        byCategory: {
          fields: { category: 'string' }
        },
        byStatus: {
          fields: { status: 'string' }
        },
        byRegion: {
          fields: { region: 'string' }
        },
        byCategoryStatus: {
          fields: { 
            category: 'string',
            status: 'string'
          }
        }
      }
    });

    // Insert product
    await resource.insert({
      id: 'prod-001',
      name: 'Laptop Pro',
      category: 'electronics',
      status: 'active',
      region: 'north'
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify initial partitions
    expect(await resource.listIds({ 
      partition: 'byCategory', 
      partitionValues: { category: 'electronics' } 
    })).toContain('prod-001');
    
    expect(await resource.listIds({ 
      partition: 'byStatus', 
      partitionValues: { status: 'active' } 
    })).toContain('prod-001');

    // Update multiple partitioned fields at once
    await resource.update('prod-001', {
      name: 'Laptop Pro',
      category: 'computers', // Changed
      status: 'inactive',    // Changed
      region: 'south'        // Changed
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify ALL old partitions are cleaned
    expect(await resource.listIds({ 
      partition: 'byCategory', 
      partitionValues: { category: 'electronics' } 
    })).not.toContain('prod-001');
    
    expect(await resource.listIds({ 
      partition: 'byStatus', 
      partitionValues: { status: 'active' } 
    })).not.toContain('prod-001');
    
    expect(await resource.listIds({ 
      partition: 'byRegion', 
      partitionValues: { region: 'north' } 
    })).not.toContain('prod-001');

    // Verify ALL new partitions contain the record
    expect(await resource.listIds({ 
      partition: 'byCategory', 
      partitionValues: { category: 'computers' } 
    })).toContain('prod-001');
    
    expect(await resource.listIds({ 
      partition: 'byStatus', 
      partitionValues: { status: 'inactive' } 
    })).toContain('prod-001');
    
    expect(await resource.listIds({ 
      partition: 'byRegion', 
      partitionValues: { region: 'south' } 
    })).toContain('prod-001');
  });

  test.skip('should handle null/undefined partition values correctly', async () => {
    const resource = await database.createResource({
      name: 'tasks',
      asyncPartitions: false,
      attributes: {
        id: 'string|required',
        title: 'string|required',
        assignee: 'string', // Optional
        priority: 'string'  // Optional
      },
      partitions: {
        byAssignee: {
          fields: { assignee: 'string' }
        },
        byPriority: {
          fields: { priority: 'string' }
        }
      }
    });

    // Insert with undefined values (not setting optional fields)
    await resource.insert({
      id: 'task-001',
      title: 'Fix bug'
      // assignee and priority are not set (undefined)
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Update from null to value
    await resource.update('task-001', {
      title: 'Fix bug',
      assignee: 'john',
      priority: 'high'
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify it's in the new partitions
    const johnTasks = await resource.listIds({
      partition: 'byAssignee',
      partitionValues: { assignee: 'john' }
    });
    expect(johnTasks).toContain('task-001');

    const highPriorityTasks = await resource.listIds({
      partition: 'byPriority',
      partitionValues: { priority: 'high' }
    });
    expect(highPriorityTasks).toContain('task-001');

    // Update back to empty string (to clear values)
    await resource.update('task-001', {
      title: 'Fix bug',
      assignee: '',
      priority: ''
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify it's removed from partitions
    const johnTasksAfter = await resource.listIds({
      partition: 'byAssignee',
      partitionValues: { assignee: 'john' }
    });
    expect(johnTasksAfter).not.toContain('task-001');
  });

  test('should handle rapid consecutive updates to partition fields', async () => {
    const resource = await database.createResource({
      name: 'documents',
      asyncPartitions: false,
      attributes: {
        id: 'string|required',
        title: 'string|required',
        status: 'string|required'
      },
      partitions: {
        byStatus: {
          fields: { status: 'string' }
        }
      }
    });

    await resource.insert({
      id: 'doc-001',
      title: 'Report',
      status: 'draft'
    });

    // Rapid updates
    await resource.update('doc-001', { title: 'Report', status: 'review' });
    await resource.update('doc-001', { title: 'Report', status: 'approved' });
    await resource.update('doc-001', { title: 'Report', status: 'published' });

    await new Promise(resolve => setTimeout(resolve, 200));

    // Should only be in the final partition
    const draftDocs = await resource.listIds({
      partition: 'byStatus',
      partitionValues: { status: 'draft' }
    });
    expect(draftDocs).not.toContain('doc-001');

    const reviewDocs = await resource.listIds({
      partition: 'byStatus',
      partitionValues: { status: 'review' }
    });
    expect(reviewDocs).not.toContain('doc-001');

    const publishedDocs = await resource.listIds({
      partition: 'byStatus',
      partitionValues: { status: 'published' }
    });
    expect(publishedDocs).toContain('doc-001');
  });

  test('should handle partition updates with special characters in values', async () => {
    const resource = await database.createResource({
      name: 'items',
      asyncPartitions: false,
      attributes: {
        id: 'string|required',
        name: 'string|required',
        tag: 'string|required'
      },
      partitions: {
        byTag: {
          fields: { tag: 'string' }
        }
      }
    });

    // Test with various special characters (reduced set for speed)
    const specialTags = [
      'tag-with-dash',
      'tag_with_underscore',
      'tag.with.dot'
    ];

    for (const tag of specialTags) {
      const itemId = `item-${tag.replace(/[^a-zA-Z0-9]/g, '')}`;

      await resource.insert({
        id: itemId,
        name: `Item for ${tag}`,
        tag: 'initial'
      });

      await resource.update(itemId, {
        name: `Item for ${tag}`,
        tag: tag
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should not be in old partition
      const initialItems = await resource.listIds({
        partition: 'byTag',
        partitionValues: { tag: 'initial' }
      });
      expect(initialItems).not.toContain(itemId);

      // Should be in new partition with special characters
      const taggedItems = await resource.listIds({
        partition: 'byTag',
        partitionValues: { tag: tag }
      });
      expect(taggedItems).toContain(itemId);
    }
  }, 30000);

  test('should handle partition field update that results in same partition key', async () => {
    const resource = await database.createResource({
      name: 'events',
      asyncPartitions: false,
      attributes: {
        id: 'string|required',
        title: 'string|required',
        date: 'string|required',
        location: 'string|required'
      },
      partitions: {
        byYearMonth: {
          fields: { 
            date: 'string|maxlength:7' // YYYY-MM format
          }
        }
      }
    });

    await resource.insert({
      id: 'event-001',
      title: 'Conference',
      date: '2024-03-15',
      location: 'NYC'
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Update date but same year-month (partition key won't change)
    await resource.update('event-001', {
      title: 'Conference',
      date: '2024-03-20', // Same YYYY-MM
      location: 'NYC'
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should still be in the same partition
    const marchEvents = await resource.listIds({
      partition: 'byYearMonth',
      partitionValues: { date: '2024-03' }
    });
    expect(marchEvents).toContain('event-001');
    expect(marchEvents.filter(id => id === 'event-001')).toHaveLength(1); // No duplicates

    // Now update to different month
    await resource.update('event-001', {
      title: 'Conference',
      date: '2024-04-15',
      location: 'NYC'
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have moved
    const marchEventsAfter = await resource.listIds({
      partition: 'byYearMonth',
      partitionValues: { date: '2024-03' }
    });
    expect(marchEventsAfter).not.toContain('event-001');

    const aprilEvents = await resource.listIds({
      partition: 'byYearMonth',
      partitionValues: { date: '2024-04' }
    });
    expect(aprilEvents).toContain('event-001');
  });

  test('should handle async partition mode with eventual consistency', async () => {
    const resource = await database.createResource({
      name: 'async-items',
      asyncPartitions: true, // Testing async mode
      attributes: {
        id: 'string|required',
        name: 'string|required',
        category: 'string|required'
      },
      partitions: {
        byCategory: {
          fields: { category: 'string' }
        }
      }
    });

    await resource.insert({
      id: 'async-001',
      name: 'Async Item',
      category: 'typeA'
    });

    // Immediate update
    await resource.update('async-001', {
      name: 'Async Item',
      category: 'typeB'
    });

    // Check immediately (might still show old state)
    // But wait a bit for async operation to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    // After async operation completes, should be moved
    const typeAItems = await resource.listIds({
      partition: 'byCategory',
      partitionValues: { category: 'typeA' }
    });
    expect(typeAItems).not.toContain('async-001');

    const typeBItems = await resource.listIds({
      partition: 'byCategory',
      partitionValues: { category: 'typeB' }
    });
    expect(typeBItems).toContain('async-001');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });
});