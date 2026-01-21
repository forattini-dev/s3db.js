import { VectorPlugin } from '../../src/plugins/vector.plugin.js';

describe('VectorPlugin - Unit Tests (Mocked)', () => {
  describe('validateVectorStorage - Complete Coverage', () => {
    test('should detect large vectors and emit warning event when autofix is disabled', () => {
      const plugin = new VectorPlugin({
        logLevel: 'silent',
        storageThreshold: 100,
        autoFixBehavior: false
      });

      // Track warning events
      const warningEvents = [];
      plugin.on('plg:vector:storage-warning', (data) => warningEvents.push(data));

      // Mock database with resources
      plugin.database = {
        resources: {
          testResource: {
            name: 'testResource',
            behavior: null,
            schema: {
              attributes: {
                id: { type: 'string' },
                vector: {
                  type: 'array',
                  items: 'number',
                  length: 50  // 50 * 7 + 50 = 400 bytes > 100
                }
              }
            }
          }
        }
      };

      // Call validation
      plugin.validateVectorStorage();

      // Should emit warning event for the large vector
      expect(warningEvents.length).toBeGreaterThan(0);
      expect(warningEvents[0].resource).toBe('testResource');
      expect(warningEvents[0].totalEstimatedBytes).toBeGreaterThan(100);
    });

    test('should auto-fix when enabled', () => {
      const plugin = new VectorPlugin({
      logLevel: 'silent',
        storageThreshold: 100,
        autoFixBehavior: true
      });

      const fixedEvents = [];
      plugin.on('plg:vector:behavior-fixed', (data) => fixedEvents.push(data));

      const mockResource = {
        name: 'testResource',
        behavior: null,
        schema: {
          attributes: {
            vector: {
              type: 'array',
              items: 'number',
              length: 50
            }
          }
        }
      };

      plugin.database = {
        resources: {
          testResource: mockResource
        }
      };

      plugin.validateVectorStorage();

      // Should have fixed
      expect(mockResource.behavior).toBe('body-overflow');
      expect(fixedEvents).toHaveLength(1);
      expect(fixedEvents[0].resource).toBe('testResource');
    });

    test('should not warn for body-overflow behavior', () => {
      const plugin = new VectorPlugin({
      logLevel: 'silent',
        storageThreshold: 100
      });

      const warnings = [];
      plugin.on('plg:vector:storage-warning', (w) => warnings.push(w));

      plugin.database = {
        resources: {
          testResource: {
            name: 'testResource',
            behavior: 'body-overflow',  // Already correct
            schema: {
              attributes: {
                vector: {
                  type: 'array',
                  items: 'number',
                  length: 50
                }
              }
            }
          }
        }
      };

      plugin.validateVectorStorage();

      expect(warnings).toHaveLength(0);
    });

    test('should not warn for body-only behavior', () => {
      const plugin = new VectorPlugin({
      logLevel: 'silent',
        storageThreshold: 100
      });

      const warnings = [];
      plugin.on('plg:vector:storage-warning', (w) => warnings.push(w));

      plugin.database = {
        resources: {
          testResource: {
            name: 'testResource',
            behavior: 'body-only',  // Also correct
            schema: {
              attributes: {
                vector: {
                  type: 'array',
                  items: 'number',
                  length: 50
                }
              }
            }
          }
        }
      };

      plugin.validateVectorStorage();

      expect(warnings).toHaveLength(0);
    });

    test('should not warn for small vectors', () => {
      const plugin = new VectorPlugin({
      logLevel: 'silent',
        storageThreshold: 1000
      });

      const warnings = [];
      plugin.on('plg:vector:storage-warning', (w) => warnings.push(w));

      plugin.database = {
        resources: {
          testResource: {
            name: 'testResource',
            behavior: null,
            schema: {
              attributes: {
                vector: {
                  type: 'array',
                  items: 'number',
                  length: 10  // 10 * 7 + 50 = 120 bytes < 1000
                }
              }
            }
          }
        }
      };

      plugin.validateVectorStorage();

      expect(warnings).toHaveLength(0);
    });

    test('should skip resources without vectors', () => {
      const plugin = new VectorPlugin();

      plugin.database = {
        resources: {
          testResource: {
            name: 'testResource',
            schema: {
              attributes: {
                id: { type: 'string' },
                name: { type: 'string' }
              }
            }
          }
        }
      };

      // Should not throw
      plugin.validateVectorStorage();
    });
  });

  describe('findVectorFields - Complete Coverage', () => {
    test('should find top-level vector fields', () => {
      const plugin = new VectorPlugin();

      const attributes = {
        id: { type: 'string' },
        vector: {
          type: 'array',
          items: 'number',
          length: 128
        }
      };

      const vectors = plugin.findVectorFields(attributes);

      expect(vectors).toHaveLength(1);
      expect(vectors[0].name).toBe('vector');
      expect(vectors[0].length).toBe(128);
    });

    test('should find nested vector fields', () => {
      const plugin = new VectorPlugin();

      const attributes = {
        metadata: {
          type: 'object',
          props: {
            embedding: {
              type: 'array',
              items: 'number',
              length: 64
            }
          }
        }
      };

      const vectors = plugin.findVectorFields(attributes);

      expect(vectors).toHaveLength(1);
      expect(vectors[0].name).toBe('metadata.embedding');
      expect(vectors[0].length).toBe(64);
    });

    test('should find deeply nested vector fields', () => {
      const plugin = new VectorPlugin();

      const attributes = {
        data: {
          type: 'object',
          props: {
            features: {
              type: 'object',
              props: {
                vector: {
                  type: 'array',
                  items: 'number',
                  length: 32
                }
              }
            }
          }
        }
      };

      const vectors = plugin.findVectorFields(attributes);

      expect(vectors).toHaveLength(1);
      expect(vectors[0].name).toBe('data.features.vector');
    });

    test('should skip arrays without items=number', () => {
      const plugin = new VectorPlugin();

      const attributes = {
        tags: {
          type: 'array',
          items: 'string'  // Not numbers
        }
      };

      const vectors = plugin.findVectorFields(attributes);

      expect(vectors).toHaveLength(0);
    });

    test('should skip arrays without length', () => {
      const plugin = new VectorPlugin();

      const attributes = {
        vector: {
          type: 'array',
          items: 'number'
          // No length specified
        }
      };

      const vectors = plugin.findVectorFields(attributes);

      expect(vectors).toHaveLength(0);
    });

    test('should find multiple vector fields', () => {
      const plugin = new VectorPlugin();

      const attributes = {
        vector1: {
          type: 'array',
          items: 'number',
          length: 128
        },
        vector2: {
          type: 'array',
          items: 'number',
          length: 256
        },
        metadata: {
          type: 'object',
          props: {
            vector3: {
              type: 'array',
              items: 'number',
              length: 512
            }
          }
        }
      };

      const vectors = plugin.findVectorFields(attributes);

      expect(vectors).toHaveLength(3);
      expect(vectors.map(v => v.name)).toContain('vector1');
      expect(vectors.map(v => v.name)).toContain('vector2');
      expect(vectors.map(v => v.name)).toContain('metadata.vector3');
    });
  });

  describe('estimateVectorBytes', () => {
    test('should estimate bytes correctly', () => {
      const plugin = new VectorPlugin();

      expect(plugin.estimateVectorBytes(128)).toBe(128 * 7 + 50);
      expect(plugin.estimateVectorBytes(256)).toBe(256 * 7 + 50);
      expect(plugin.estimateVectorBytes(1536)).toBe(1536 * 7 + 50);
    });

    test('should handle zero dimensions', () => {
      const plugin = new VectorPlugin();

      expect(plugin.estimateVectorBytes(0)).toBe(50);
    });

    test('should handle large dimensions', () => {
      const plugin = new VectorPlugin();

      expect(plugin.estimateVectorBytes(10000)).toBe(10000 * 7 + 50);
    });
  });

  describe('createVectorSearchMethod - Coverage', () => {
    test('should throw error for invalid distance metric', async () => {
      const plugin = new VectorPlugin();

      const mockResource = {
        name: 'testResource',
        schema: {
          attributes: {
            vector: {
              type: 'array',
              items: 'number',
              length: 3
            }
          }
        },
        getAll: vi.fn().mockResolvedValue([])
      };

      const searchMethod = plugin.createVectorSearchMethod(mockResource);

      await expect(
        searchMethod([1, 2, 3], { distanceMetric: 'invalid' })
      ).rejects.toThrow('Invalid distance metric');
    });

    test('should call list with partition when provided', async () => {
      const plugin = new VectorPlugin();

      const records = [
        { id: '1', vector: [1, 0, 0] }
      ];
      const mockResource = {
        name: 'testResource',
        schema: {
          attributes: {
            vector: {
              type: 'array',
              items: 'number',
              length: 3
            }
          }
        },
        list: vi.fn().mockImplementation(({ limit = 1000, offset = 0 } = {}) => {
          return Promise.resolve(records.slice(offset, offset + limit));
        })
      };

      const searchMethod = plugin.createVectorSearchMethod(mockResource);

      await searchMethod([1, 0, 0], {
        partition: 'byCategory',
        partitionValues: { category: 'Electronics' },
        pageSize: 5
      });

      expect(mockResource.list).toHaveBeenCalledWith({
        partition: 'byCategory',
        partitionValues: { category: 'Electronics' },
        limit: 5,
        offset: 0
      });
    });

    test('should filter by threshold', async () => {
      const plugin = new VectorPlugin();

      const records = [
        { id: '1', vector: [1, 0, 0] },  // dist = 0
        { id: '2', vector: [0, 1, 0] },  // dist ~ 1 (cosine)
        { id: '3', vector: [-1, 0, 0] }  // dist ~ 2 (opposite)
      ];
      const mockResource = {
        name: 'testResource',
        schema: {
          attributes: {
            vector: {
              type: 'array',
              items: 'number',
              length: 3
            }
          }
        },
        list: vi.fn().mockImplementation(({ limit = 1000, offset = 0 } = {}) => {
          return Promise.resolve(records.slice(offset, offset + limit));
        })
      };

      const searchMethod = plugin.createVectorSearchMethod(mockResource);

      const results = await searchMethod([1, 0, 0], {
        threshold: 0.5,  // Only very close matches
        distanceMetric: 'cosine'
      });

      expect(results.length).toBeLessThan(3);  // Should filter some out
    });

    test('should skip records without vector field', async () => {
      const plugin = new VectorPlugin();

      const records = [
        { id: '1', vector: [1, 0, 0] },
        { id: '2' },  // No vector
        { id: '3', vector: null }  // Null vector
      ];
      const mockResource = {
        name: 'testResource',
        schema: {
          attributes: {
            vector: {
              type: 'array',
              items: 'number',
              length: 3
            }
          }
        },
        list: vi.fn().mockImplementation(({ limit = 1000, offset = 0 } = {}) => {
          return Promise.resolve(records.slice(offset, offset + limit));
        })
      };

      const searchMethod = plugin.createVectorSearchMethod(mockResource);

      const results = await searchMethod([1, 0, 0]);

      expect(results).toHaveLength(1);
      expect(results[0].record.id).toBe('1');
    });

    test('should handle dimension mismatch gracefully', async () => {
      const plugin = new VectorPlugin();

      const records = [
        { id: '1', vector: [1, 0, 0] },
        { id: '2', vector: [1, 0] }  // Different dimension
      ];
      const mockResource = {
        name: 'testResource',
        schema: {
          attributes: {
            vector: {
              type: 'array',
              items: 'number',
              length: 3
            }
          }
        },
        list: vi.fn().mockImplementation(({ limit = 1000, offset = 0 } = {}) => {
          return Promise.resolve(records.slice(offset, offset + limit));
        })
      };

      const searchMethod = plugin.createVectorSearchMethod(mockResource);

      const results = await searchMethod([1, 0, 0]);

      // Should only return matching dimension
      expect(results).toHaveLength(1);
      expect(results[0].record.id).toBe('1');
    });
  });

  describe('vectorSearchPaged', () => {
    test('should return paged results with stats', async () => {
      const plugin = new VectorPlugin();

      const records = [
        { id: '1', vector: [1, 0] },
        { id: '2', vector: [0.9, 0.1] },
        { id: '3', vector: [0, 1] },
        { id: '4', vector: [-1, 0] },
        { id: '5', vector: [0.7, 0.7] }
      ];

      const mockResource = {
        name: 'testResource',
        schema: {
          attributes: {
            vector: {
              type: 'array',
              items: 'number',
              length: 2
            }
          }
        },
        list: vi.fn().mockImplementation(({ limit = 1000, offset = 0 } = {}) => {
          return Promise.resolve(records.slice(offset, offset + limit));
        })
      };

      const searchPagedMethod = plugin.createVectorSearchPagedMethod(mockResource);

      const { results, stats } = await searchPagedMethod([1, 0], {
        limit: 2,
        pageSize: 2,
        distanceMetric: 'cosine'
      });

      expect(results).toHaveLength(2);
      expect(results[0].record.id).toBe('1');
      expect(stats.pagesScanned).toBeGreaterThan(1);
      expect(stats.scannedRecords).toBe(5);
      expect(stats.approximate).toBe(false);
      expect(mockResource.list).toHaveBeenCalledTimes(3);
    });

    test('should enforce partition policy error', async () => {
      const plugin = new VectorPlugin({
        partitionPolicy: 'error',
        maxUnpartitionedRecords: 2
      });

      const mockResource = {
        name: 'testResource',
        schema: {
          attributes: {
            vector: {
              type: 'array',
              items: 'number',
              length: 2
            }
          }
        },
        list: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(3)
      };

      const searchPagedMethod = plugin.createVectorSearchPagedMethod(mockResource);

      await expect(searchPagedMethod([1, 0], { pageSize: 2 })).rejects.toThrow('requires a partition');
      expect(mockResource.count).toHaveBeenCalled();
      expect(mockResource.list).not.toHaveBeenCalled();
    });

    test('should stop early with maxScannedRecords', async () => {
      const plugin = new VectorPlugin();

      const records = [
        { id: '1', vector: [1, 0] },
        { id: '2', vector: [0.9, 0.1] },
        { id: '3', vector: [0, 1] },
        { id: '4', vector: [-1, 0] },
        { id: '5', vector: [0.7, 0.7] }
      ];

      const mockResource = {
        name: 'testResource',
        schema: {
          attributes: {
            vector: {
              type: 'array',
              items: 'number',
              length: 2
            }
          }
        },
        list: vi.fn().mockImplementation(({ limit = 1000, offset = 0 } = {}) => {
          return Promise.resolve(records.slice(offset, offset + limit));
        })
      };

      const searchPagedMethod = plugin.createVectorSearchPagedMethod(mockResource);

      const { stats } = await searchPagedMethod([1, 0], {
        limit: 3,
        pageSize: 2,
        maxScannedRecords: 3
      });

      expect(stats.approximate).toBe(true);
      expect(stats.scannedRecords).toBe(3);
    });
  });

  describe('createClusteringMethod - Coverage', () => {
    test('should throw error for invalid distance metric', async () => {
      const plugin = new VectorPlugin();

      const mockResource = {
        name: 'testResource',
        schema: {
          attributes: {
            vector: {
              type: 'array',
              items: 'number',
              length: 2
            }
          }
        },
        getAll: vi.fn().mockResolvedValue([])
      };

      const clusterMethod = plugin.createClusteringMethod(mockResource);

      await expect(
        clusterMethod({ k: 2, distanceMetric: 'invalid' })
      ).rejects.toThrow('Invalid distance metric');
    });

    test('should call list with partition when provided', async () => {
      const plugin = new VectorPlugin();

      const mockResource = {
        name: 'testResource',
        schema: {
          attributes: {
            vector: {
              type: 'array',
              items: 'number',
              length: 2
            }
          }
        },
        list: vi.fn().mockResolvedValue([
          { id: '1', vector: [0, 0] },
          { id: '2', vector: [1, 1] }
        ])
      };

      const clusterMethod = plugin.createClusteringMethod(mockResource);

      await clusterMethod({
        k: 1,
        partition: 'byCategory',
        partitionValues: { category: 'Electronics' }
      });

      expect(mockResource.list).toHaveBeenCalled();
    });

    test('should pass through all kmeans options', async () => {
      const plugin = new VectorPlugin();

      const mockResource = {
        name: 'testResource',
        schema: {
          attributes: {
            vector: {
              type: 'array',
              items: 'number',
              length: 2
            }
          }
        },
        getAll: vi.fn().mockResolvedValue([
          { id: '1', vector: [0, 0] },
          { id: '2', vector: [1, 1] }
        ])
      };

      const clusterMethod = plugin.createClusteringMethod(mockResource);

      const result = await clusterMethod({
        k: 1,
        maxIterations: 50,
        tolerance: 0.001,
        seed: 42
      });

      expect(result.iterations).toBeLessThanOrEqual(50);
      expect(result).toHaveProperty('converged');
    });
  });

  describe('createDistanceMethod - Coverage', () => {
    test('should throw error for invalid metric', () => {
      const plugin = new VectorPlugin();

      const distanceMethod = plugin.createDistanceMethod();

      expect(() => {
        distanceMethod([1, 0], [0, 1], 'invalid');
      }).toThrow('Invalid distance metric');
    });

    test('should use default metric from config', () => {
      const plugin = new VectorPlugin({
      logLevel: 'silent',
        distanceMetric: 'euclidean'
      });

      const distanceMethod = plugin.createDistanceMethod();

      const dist = distanceMethod([0, 0], [3, 4]);
      expect(dist).toBeCloseTo(5, 5);
    });

    test('should override default metric', () => {
      const plugin = new VectorPlugin({
      logLevel: 'silent',
        distanceMetric: 'cosine'
      });

      const distanceMethod = plugin.createDistanceMethod();

      // Use euclidean explicitly
      const dist = distanceMethod([0, 0], [3, 4], 'euclidean');
      expect(dist).toBeCloseTo(5, 5);
    });
  });

  describe('installResourceMethods', () => {
    test('should install all three methods on each resource', () => {
      const plugin = new VectorPlugin();

      const mockResource1 = {};
      const mockResource2 = {};

      plugin.database = {
        resources: {
          users: mockResource1,
          products: mockResource2
        }
      };

      plugin.installResourceMethods();

      // Check technical methods
      expect(typeof mockResource1.vectorSearch).toBe('function');
      expect(typeof mockResource1.vectorSearchPaged).toBe('function');
      expect(typeof mockResource1.cluster).toBe('function');
      expect(typeof mockResource1.vectorDistance).toBe('function');

      expect(typeof mockResource2.vectorSearch).toBe('function');
      expect(typeof mockResource2.vectorSearchPaged).toBe('function');
      expect(typeof mockResource2.cluster).toBe('function');
      expect(typeof mockResource2.vectorDistance).toBe('function');

      // Check intuitive aliases
      expect(typeof mockResource1.similarTo).toBe('function');
      expect(typeof mockResource1.findSimilar).toBe('function');
      expect(typeof mockResource1.distance).toBe('function');

      expect(typeof mockResource2.similarTo).toBe('function');
      expect(typeof mockResource2.findSimilar).toBe('function');
      expect(typeof mockResource2.distance).toBe('function');

      // Verify aliases point to same methods
      expect(mockResource1.similarTo).toBe(mockResource1.vectorSearch);
      expect(mockResource1.findSimilar).toBe(mockResource1.vectorSearch);
      expect(mockResource1.distance).toBe(mockResource1.vectorDistance);
    });
  });

  describe('onUninstall', () => {
    test('should remove all methods from all resources', async () => {
      const plugin = new VectorPlugin();

      const mockResource1 = {
        vectorSearch: vi.fn(),
        vectorSearchPaged: vi.fn(),
        cluster: vi.fn(),
        vectorDistance: vi.fn(),
        similarTo: vi.fn(),
        findSimilar: vi.fn(),
        distance: vi.fn()
      };

      const mockResource2 = {
        vectorSearch: vi.fn(),
        vectorSearchPaged: vi.fn(),
        cluster: vi.fn(),
        vectorDistance: vi.fn(),
        similarTo: vi.fn(),
        findSimilar: vi.fn(),
        distance: vi.fn()
      };

      plugin.database = {
        resources: {
          users: mockResource1,
          products: mockResource2
        }
      };

      await plugin.onUninstall();

      // Check technical methods removed
      expect(mockResource1.vectorSearch).toBeUndefined();
      expect(mockResource1.vectorSearchPaged).toBeUndefined();
      expect(mockResource1.cluster).toBeUndefined();
      expect(mockResource1.vectorDistance).toBeUndefined();

      expect(mockResource2.vectorSearch).toBeUndefined();
      expect(mockResource2.vectorSearchPaged).toBeUndefined();
      expect(mockResource2.cluster).toBeUndefined();
      expect(mockResource2.vectorDistance).toBeUndefined();

      // Check aliases removed
      expect(mockResource1.similarTo).toBeUndefined();
      expect(mockResource1.findSimilar).toBeUndefined();
      expect(mockResource1.distance).toBeUndefined();

      expect(mockResource2.similarTo).toBeUndefined();
      expect(mockResource2.findSimilar).toBeUndefined();
      expect(mockResource2.distance).toBeUndefined();
    });
  });

  describe('Plugin Lifecycle', () => {
    test('should emit started event on onStart', async () => {
      const plugin = new VectorPlugin();

      const events = [];
      plugin.on('db:plugin:started', (data) => events.push(data));

      await plugin.onStart();

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        plugin: 'VectorPlugin'
      });
    });

    test('should emit stopped event on onStop', async () => {
      const plugin = new VectorPlugin();

      const events = [];
      plugin.on('db:plugin:stopped', (data) => events.push(data));

      await plugin.onStop();

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        plugin: 'VectorPlugin'
      });
    });
  });

  describe('Partition Handling', () => {
    test('should call list with partition in vectorSearch', async () => {
      const plugin = new VectorPlugin();

      const records = [
        { id: '1', vector: [1, 0, 0] },
        { id: '2', vector: [0.9, 0.1, 0] }
      ];
      const mockResource = {
        name: 'testResource',
        schema: {
          attributes: {
            vector: {
              type: 'array',
              items: 'number',
              length: 3
            }
          }
        },
        list: vi.fn().mockImplementation(({ limit = 1000, offset = 0 } = {}) => {
          return Promise.resolve(records.slice(offset, offset + limit));
        })
      };

      const searchMethod = plugin.createVectorSearchMethod(mockResource);

      const results = await searchMethod([1, 0, 0], {
        partition: 'byCategory',
        partitionValues: { category: 'tech' },
        pageSize: 2
      });

      expect(mockResource.list).toHaveBeenCalledWith({
        partition: 'byCategory',
        partitionValues: { category: 'tech' },
        limit: 2,
        offset: 0
      });
      expect(results).toHaveLength(2);
      expect(results[0].record.id).toBe('1');
    });

    test('should call list with partition in cluster', async () => {
      const plugin = new VectorPlugin();

      const mockResource = {
        name: 'testResource',
        schema: {
          attributes: {
            vector: {
              type: 'array',
              items: 'number',
              length: 2
            }
          }
        },
        list: vi.fn().mockResolvedValue([
          { id: '1', vector: [0, 0] },
          { id: '2', vector: [1, 1] },
          { id: '3', vector: [10, 10] }
        ])
      };

      const clusterMethod = plugin.createClusteringMethod(mockResource);

      const result = await clusterMethod({
        k: 2,
        partition: 'byRegion',
        partitionValues: { region: 'US' }
      });

      expect(mockResource.list).toHaveBeenCalledWith({ partition: 'byRegion', partitionValues: { region: 'US' } });
      expect(result.clusters).toHaveLength(2);
    });
  });

  describe('Static Utility Methods', () => {
    test('should normalize vectors', () => {
      const vector = [3, 4];
      const normalized = VectorPlugin.normalize(vector);

      expect(normalized[0]).toBeCloseTo(0.6, 5);
      expect(normalized[1]).toBeCloseTo(0.8, 5);

      // Should have magnitude 1
      const mag = Math.sqrt(normalized[0]**2 + normalized[1]**2);
      expect(mag).toBeCloseTo(1, 5);
    });

    test('should calculate dot product', () => {
      const v1 = [1, 2, 3];
      const v2 = [4, 5, 6];

      const product = VectorPlugin.dotProduct(v1, v2);

      expect(product).toBe(32); // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
    });

    test('should find optimal K', async () => {
      const vectors = [
        [0, 0], [1, 1], [0.9, 1.1],
        [10, 10], [11, 11], [10.5, 10.5]
      ];

      const result = await VectorPlugin.findOptimalK(vectors, {
        minK: 2,
        maxK: 4,
        nReferences: 5 // Fewer references for faster test
      });

      expect(result).toHaveProperty('consensus');
      expect(result).toHaveProperty('summary');
      expect(result.summary).toHaveProperty('recommendation');
      expect(result).toHaveProperty('results');
      expect(result.results).toBeInstanceOf(Array);
      expect(result.results.length).toBeGreaterThan(0);
    });
  });
});
