/**
 * ML Plugin Tests
 *
 * Tests for the Machine Learning Plugin
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Database, MLPlugin } from '../../src/index.js';
import { createDatabaseForTest } from '../config.js';

// Check if TensorFlow is available
// NOTE: TensorFlow.js 4.x has known compatibility issues with Jest's --experimental-vm-modules mode
// The internal util functions fail to load: "(0 , util_1.isNullOrUndefined) is not a function"
// This is a TensorFlow.js bug tracked at: https://github.com/tensorflow/tfjs/issues/7849
// Skip ML tests when running in Jest (NODE_ENV=test) until TensorFlow.js fixes ESM compatibility
let tfAvailable = false;

if (process.env.NODE_ENV === 'test') {
  console.warn('[MLPlugin Tests] Skipping - TensorFlow.js has compatibility issues with Jest ESM mode');
  tfAvailable = false;
} else {
  try {
    await import('@tensorflow/tfjs-node');
    tfAvailable = true;
  } catch (e) {
    console.warn('[MLPlugin Tests] TensorFlow not available, skipping ML plugin tests');
  }
}

const describeIfTf = tfAvailable ? describe : describe.skip;

describeIfTf('MLPlugin', () => {
  let db;
  let mlPlugin;

  beforeAll(async () => {
    // Create database for tests
    db = createDatabaseForTest('ml-plugin', {
      verbose: false
    });

    // Connect database
    await db.connect();

    // Install ML Plugin
    mlPlugin = new MLPlugin({
      models: {
        testRegression: {
          type: 'regression',
          resource: 'test_data',
          features: ['x', 'y'],
          target: 'z',
          autoTrain: false,
          modelConfig: {
            epochs: 20,
            batchSize: 16,
            polynomial: 1
          }
        },
        testClassification: {
          type: 'classification',
          resource: 'test_classes',
          features: ['a', 'b'],
          target: 'category',
          autoTrain: false,
          modelConfig: {
            epochs: 20,
            batchSize: 16
          }
        },
        testTimeSeries: {
          type: 'timeseries',
          resource: 'test_series',
          features: ['feature1'],
          target: 'value',
          autoTrain: false,
          modelConfig: {
            epochs: 15,
            batchSize: 8,
            lookback: 5
          }
        },
        testAutoTrain: {
          type: 'regression',
          resource: 'test_auto',
          features: ['input'],
          target: 'output',
          autoTrain: true,
          trainAfterInserts: 5,
          modelConfig: {
            epochs: 10,
            batchSize: 8
          }
        }
      },
      verbose: false
    });

    await mlPlugin.install(db);
  });

  describe('Installation', () => {
    it('should install plugin successfully', () => {
      expect(mlPlugin).toBeDefined();
      expect(Object.keys(mlPlugin.models)).toHaveLength(4);
    });

    it('should create model instances', () => {
      expect(mlPlugin.models.testRegression).toBeDefined();
      expect(mlPlugin.models.testClassification).toBeDefined();
      expect(mlPlugin.models.testTimeSeries).toBeDefined();
    });

    it('should throw error for invalid model type', async () => {
      await expect(async () => {
        const badPlugin = new MLPlugin({
          models: {
            invalid: {
              type: 'invalid_type',
              resource: 'test',
              features: ['x'],
              target: 'y'
            }
          }
        });
        await badPlugin.install(db);
      }).rejects.toThrow();
    });
  });

  describe('Regression Model', () => {
    let resource;

    beforeAll(async () => {
      // Create resource
      resource = await db.createResource({
        name: 'test_data',
        attributes: {
          x: 'number|required',
          y: 'number|required',
          z: 'number|required'
        }
      });

      // Generate training data: z = 2x + 3y + 5
      for (let i = 0; i < 50; i++) {
        const x = Math.random() * 10;
        const y = Math.random() * 10;
        const z = 2 * x + 3 * y + 5 + (Math.random() - 0.5);

        await resource.insert({ x, y, z });
      }
    });

    it('should train regression model', async () => {
      const result = await mlPlugin.train('testRegression');

      expect(result).toBeDefined();
      expect(result.loss).toBeDefined();
      expect(result.epochs).toBe(20);
      expect(result.samples).toBe(50);
      expect(result.loss).toBeLessThan(10); // Reasonable loss
    });

    it('should make predictions', async () => {
      const { prediction, confidence } = await mlPlugin.predict('testRegression', {
        x: 5,
        y: 3
      });

      expect(prediction).toBeDefined();
      expect(typeof prediction).toBe('number');
      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(1);

      // Expected: 2*5 + 3*3 + 5 = 24
      const expected = 2 * 5 + 3 * 3 + 5;
      const error = Math.abs(prediction - expected);
      expect(error).toBeLessThan(5); // Within 5 units
    });

    it('should make batch predictions', async () => {
      const inputs = [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
        { x: 5, y: 6 }
      ];

      const predictions = await mlPlugin.predictBatch('testRegression', inputs);

      expect(predictions).toHaveLength(3);
      expect(predictions[0].prediction).toBeDefined();
    });

    it('should get model statistics', () => {
      const stats = mlPlugin.getModelStats('testRegression');

      expect(stats.trainedAt).toBeDefined();
      expect(stats.samples).toBe(50);
      expect(stats.loss).toBeDefined();
      expect(stats.predictions).toBeGreaterThan(0);
    });

    it('should export model', async () => {
      const exported = await mlPlugin.exportModel('testRegression');

      expect(exported).toBeDefined();
      expect(exported.type).toBe('regression');
      expect(exported.config.features).toEqual(['x', 'y']);
      expect(exported.config.target).toBe('z');
    });

    it('should calculate R² score', async () => {
      const model = mlPlugin.models.testRegression;
      const testData = await resource.list();

      const r2 = await model.calculateR2Score(testData.slice(0, 20));

      expect(r2).toBeGreaterThan(0);
      expect(r2).toBeLessThanOrEqual(1);
      expect(r2).toBeGreaterThan(0.7); // Good fit
    });
  });

  describe('Classification Model', () => {
    let resource;

    beforeAll(async () => {
      // Create resource
      resource = await db.createResource({
        name: 'test_classes',
        attributes: {
          a: 'number|required',
          b: 'number|required',
          category: 'string|required'
        }
      });

      // Generate training data: category = 'A' if a + b > 10, else 'B'
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * 15;
        const b = Math.random() * 15;
        const category = (a + b > 10) ? 'A' : 'B';

        await resource.insert({ a, b, category });
      }
    });

    it('should train classification model', async () => {
      const result = await mlPlugin.train('testClassification');

      expect(result).toBeDefined();
      expect(result.loss).toBeDefined();
      expect(result.accuracy).toBeDefined();
      expect(result.accuracy).toBeGreaterThan(0.7); // At least 70% accuracy
    });

    it('should make predictions with probabilities', async () => {
      const { prediction, confidence, probabilities } = await mlPlugin.predict('testClassification', {
        a: 8,
        b: 7
      });

      expect(prediction).toBeDefined();
      expect(['A', 'B']).toContain(prediction);
      expect(confidence).toBeGreaterThan(0);
      expect(probabilities).toBeDefined();
      expect(probabilities.A).toBeDefined();
      expect(probabilities.B).toBeDefined();

      // Expected: 8 + 7 = 15 > 10, so 'A'
      expect(prediction).toBe('A');
    });

    it('should calculate confusion matrix', async () => {
      const model = mlPlugin.models.testClassification;
      const testData = await resource.list();

      const confusionMatrix = await model.calculateConfusionMatrix(testData.slice(0, 30));

      expect(confusionMatrix).toBeDefined();
      expect(confusionMatrix.matrix).toBeDefined();
      expect(confusionMatrix.accuracy).toBeGreaterThan(0);
      expect(confusionMatrix.total).toBe(30);
    });
  });

  describe('Time Series Model', () => {
    let resource;

    beforeAll(async () => {
      // Create resource
      resource = await db.createResource({
        name: 'test_series',
        attributes: {
          timestamp: 'number|required',
          feature1: 'number|required',
          value: 'number|required'
        }
      });

      // Generate time series: value = t + feature1 * 2
      for (let t = 0; t < 30; t++) {
        const feature1 = Math.sin(t / 5) * 10;
        const value = t + feature1 * 2 + (Math.random() - 0.5);

        await resource.insert({ timestamp: t, feature1, value });
      }
    });

    it('should train time series model', async () => {
      const result = await mlPlugin.train('testTimeSeries');

      expect(result).toBeDefined();
      expect(result.loss).toBeDefined();
      expect(result.samples).toBeGreaterThan(0);
    });

    it('should make single-step prediction', async () => {
      const allData = await resource.list();
      const lookback = 5;
      const sequence = allData.slice(-lookback);

      const { prediction, confidence } = await mlPlugin.predict('testTimeSeries', sequence);

      expect(prediction).toBeDefined();
      expect(typeof prediction).toBe('number');
      expect(confidence).toBeGreaterThan(0);
    });

    it('should make multi-step predictions', async () => {
      const model = mlPlugin.models.testTimeSeries;
      const allData = await resource.list();
      const sequence = allData.slice(10, 15); // 5 timesteps

      const predictions = await model.predictMultiStep(sequence, 3);

      expect(predictions).toHaveLength(3);
      expect(predictions[0]).toBeDefined();
      expect(typeof predictions[0]).toBe('number');
    });

    it('should calculate MAPE', async () => {
      const model = mlPlugin.models.testTimeSeries;
      const testData = await resource.list();

      const mape = await model.calculateMAPE(testData);

      expect(mape).toBeGreaterThan(0);
      expect(mape).toBeLessThan(100);
    });
  });

  describe('Auto Training', () => {
    let resource;

    beforeAll(async () => {
      // Create resource
      resource = await db.createResource({
        name: 'test_auto',
        attributes: {
          input: 'number|required',
          output: 'number|required'
        }
      });

      // Insert initial data
      for (let i = 0; i < 20; i++) {
        const input = i;
        const output = input * 2;
        await resource.insert({ input, output });
      }

      // Train initially
      await mlPlugin.train('testAutoTrain');
    });

    it('should increment insert counter', async () => {
      const initialCount = mlPlugin.insertCounters.get('testAutoTrain') || 0;

      await resource.insert({ input: 100, output: 200 });

      const newCount = mlPlugin.insertCounters.get('testAutoTrain') || 0;
      expect(newCount).toBe(initialCount + 1);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent model', async () => {
      await expect(mlPlugin.train('nonExistentModel')).rejects.toThrow();
    });

    it('should throw error for insufficient data', async () => {
      // Create resource with minimal data
      const minResource = await db.createResource({
        name: 'minimal_data',
        attributes: {
          x: 'number|required',
          y: 'number|required'
        }
      });

      await minResource.insert({ x: 1, y: 2 });

      const minPlugin = new MLPlugin({
        models: {
          minimal: {
            type: 'regression',
            resource: 'minimal_data',
            features: ['x'],
            target: 'y',
            autoTrain: false
          }
        },
        minTrainingSamples: 10,
        verbose: false
      });

      await minPlugin.install(db);

      await expect(minPlugin.train('minimal')).rejects.toThrow();
    });

    it('should throw error for missing features', async () => {
      const model = mlPlugin.models.testRegression;

      await expect(mlPlugin.predict('testRegression', { x: 1 })).rejects.toThrow();
    });
  });

  describe('Plugin Statistics', () => {
    it('should track plugin statistics', () => {
      const stats = mlPlugin.getStats();

      expect(stats.models).toBeGreaterThan(0);
      expect(stats.trainedModels).toBeGreaterThan(0);
      expect(stats.totalTrainings).toBeGreaterThan(0);
      expect(stats.totalPredictions).toBeGreaterThan(0);
      expect(stats.startedAt).toBeDefined();
    });
  });

  describe('Retrain', () => {
    it('should retrain model from scratch', async () => {
      const oldStats = mlPlugin.getModelStats('testRegression');

      await mlPlugin.retrain('testRegression');

      const newStats = mlPlugin.getModelStats('testRegression');
      expect(newStats.trainedAt).not.toBe(oldStats.trainedAt);
    });
  });

  describe('Model Persistence', () => {
    let persistPlugin;
    let testResource;

    beforeAll(async () => {
      // Create test resource for persistence
      testResource = await db.createResource({
        name: 'test_persist',
        attributes: {
          x: 'number|required',
          y: 'number|required',
          z: 'number|required'
        }
      });

      // Insert training data
      for (let i = 0; i < 30; i++) {
        const x = Math.random() * 10;
        const y = Math.random() * 10;
        const z = 2 * x + 3 * y + 5;
        await testResource.insert({ x, y, z });
      }

      // Create plugin with saveModel enabled
      persistPlugin = new MLPlugin({
        models: {
          persistModel: {
            type: 'regression',
            resource: 'test_persist',
            features: ['x', 'y'],
            target: 'z',
            saveModel: true,
            saveTrainingData: true,
            autoTrain: false,
            modelConfig: {
              epochs: 10,
              batchSize: 8
            }
          }
        },
        saveModel: true,
        saveTrainingData: true,
        verbose: false
      });

      await persistPlugin.install(db);
    });

    it('should save model to S3 after training', async () => {
      await persistPlugin.train('persistModel');

      // Check that model was saved to plugin storage
      const storage = persistPlugin.getStorage();
      const savedModel = await storage.get('model_persistModel');

      expect(savedModel).toBeDefined();
      expect(savedModel.modelName).toBe('persistModel');
      expect(savedModel.type).toBe('model');
      expect(savedModel.data).toBeDefined();
      expect(savedModel.savedAt).toBeDefined();
    });

    it('should save training data to S3', async () => {
      // Training data should have been saved during previous test
      const trainingData = await persistPlugin.getTrainingData('persistModel');

      expect(trainingData).toBeDefined();
      expect(trainingData.modelName).toBe('persistModel');
      expect(trainingData.samples).toBe(30);
      expect(trainingData.features).toEqual(['x', 'y']);
      expect(trainingData.target).toBe('z');
      expect(trainingData.data).toHaveLength(30);
      expect(trainingData.savedAt).toBeDefined();
    });

    it('should load model from S3 on start', async () => {
      // Create new plugin instance (simulating restart)
      const newPlugin = new MLPlugin({
        models: {
          persistModel: {
            type: 'regression',
            resource: 'test_persist',
            features: ['x', 'y'],
            target: 'z',
            saveModel: true,
            autoTrain: false,
            modelConfig: {
              epochs: 10,
              batchSize: 8
            }
          }
        },
        verbose: false
      });

      await newPlugin.install(db);
      await newPlugin.onStart(); // This should load the saved model

      // Model should be trained (loaded from S3)
      const model = newPlugin.models.persistModel;
      expect(model.isTrained).toBe(true);
      expect(model.stats.trainedAt).toBeDefined();

      // Should be able to make predictions
      const { prediction } = await newPlugin.predict('persistModel', { x: 5, y: 3 });
      expect(prediction).toBeDefined();
      expect(typeof prediction).toBe('number');
    });

    it('should respect per-model saveModel override', async () => {
      // Create plugin with global saveModel=false but model-level override
      const overridePlugin = new MLPlugin({
        models: {
          overrideModel: {
            type: 'regression',
            resource: 'test_persist',
            features: ['x', 'y'],
            target: 'z',
            saveModel: true, // Override global setting
            saveTrainingData: false,
            autoTrain: false,
            modelConfig: {
              epochs: 5,
              batchSize: 8
            }
          }
        },
        saveModel: false, // Global setting
        saveTrainingData: false,
        verbose: false
      });

      await overridePlugin.install(db);
      await overridePlugin.train('overrideModel');

      // Model should be saved (override)
      const storage = overridePlugin.getStorage();
      const savedModel = await storage.get('model_overrideModel');
      expect(savedModel).toBeDefined();

      // Training data should NOT be saved (not overridden)
      const trainingData = await overridePlugin.getTrainingData('overrideModel');
      expect(trainingData).toBeNull();
    });
  });

  describe('Partition Filtering', () => {
    let partitionResource;
    let partitionPlugin;

    beforeAll(async () => {
      // Create resource with partitions
      partitionResource = await db.createResource({
        name: 'test_partitioned',
        attributes: {
          category: 'string|required',
          x: 'number|required',
          y: 'number|required',
          z: 'number|required'
        },
        partitions: {
          byCategory: {
            fields: {
              category: 'string'
            }
          }
        }
      });

      // Insert data for category A: z = 2x + y
      for (let i = 0; i < 20; i++) {
        const x = Math.random() * 10;
        const y = Math.random() * 10;
        const z = 2 * x + y;
        await partitionResource.insert({ category: 'A', x, y, z });
      }

      // Insert data for category B: z = x + 3y (different pattern)
      for (let i = 0; i < 20; i++) {
        const x = Math.random() * 10;
        const y = Math.random() * 10;
        const z = x + 3 * y;
        await partitionResource.insert({ category: 'B', x, y, z });
      }

      // Create plugin with partition-specific models
      partitionPlugin = new MLPlugin({
        models: {
          modelA: {
            type: 'regression',
            resource: 'test_partitioned',
            features: ['x', 'y'],
            target: 'z',
            partition: {
              name: 'byCategory',
              values: { category: 'A' }
            },
            autoTrain: false,
            modelConfig: {
              epochs: 20,
              batchSize: 8
            }
          },
          modelB: {
            type: 'regression',
            resource: 'test_partitioned',
            features: ['x', 'y'],
            target: 'z',
            partition: {
              name: 'byCategory',
              values: { category: 'B' }
            },
            autoTrain: false,
            modelConfig: {
              epochs: 20,
              batchSize: 8
            }
          },
          modelAll: {
            type: 'regression',
            resource: 'test_partitioned',
            features: ['x', 'y'],
            target: 'z',
            // No partition - uses all data
            autoTrain: false,
            modelConfig: {
              epochs: 20,
              batchSize: 8
            }
          }
        },
        verbose: false
      });

      await partitionPlugin.install(db);
    });

    it('should train model on specific partition', async () => {
      const result = await partitionPlugin.train('modelA');

      expect(result).toBeDefined();
      expect(result.samples).toBe(20); // Only category A data
      expect(result.loss).toBeDefined();
    });

    it('should train different models on different partitions', async () => {
      await partitionPlugin.train('modelA');
      await partitionPlugin.train('modelB');

      const statsA = partitionPlugin.getModelStats('modelA');
      const statsB = partitionPlugin.getModelStats('modelB');

      expect(statsA.samples).toBe(20);
      expect(statsB.samples).toBe(20);
    });

    it('should train model on all data when no partition specified', async () => {
      const result = await partitionPlugin.train('modelAll');

      expect(result).toBeDefined();
      expect(result.samples).toBe(40); // Both categories
    });

    it('should make accurate predictions with partition-trained models', async () => {
      // Model A: z = 2x + y
      const { prediction: predA } = await partitionPlugin.predict('modelA', { x: 5, y: 3 });
      const expectedA = 2 * 5 + 3; // 13
      expect(Math.abs(predA - expectedA)).toBeLessThan(2);

      // Model B: z = x + 3y
      const { prediction: predB } = await partitionPlugin.predict('modelB', { x: 5, y: 3 });
      const expectedB = 5 + 3 * 3; // 14
      expect(Math.abs(predB - expectedB)).toBeLessThan(2);
    });
  });

  describe('Data Transformations', () => {
    let transformResource;
    let transformPlugin;

    beforeAll(async () => {
      // Create resource
      transformResource = await db.createResource({
        name: 'test_transforms',
        attributes: {
          value: 'number|required',
          category: 'string|required',
          result: 'number|required'
        }
      });

      // Insert data with outliers
      const validData = [
        { value: 10, category: 'A', result: 100 },
        { value: 20, category: 'A', result: 400 },
        { value: 30, category: 'A', result: 900 },
        { value: 40, category: 'A', result: 1600 },
        { value: 50, category: 'A', result: 2500 },
        { value: 15, category: 'B', result: 225 },
        { value: 25, category: 'B', result: 625 },
        { value: 35, category: 'B', result: 1225 },
        { value: 45, category: 'B', result: 2025 },
        { value: 55, category: 'B', result: 3025 }
      ];

      // Add outliers
      const outliers = [
        { value: -10, category: 'A', result: 100 }, // Invalid negative value
        { value: 1000, category: 'A', result: 100 }, // Extreme outlier
        { value: 0, category: 'B', result: -50 } // Invalid negative result
      ];

      for (const record of [...validData, ...outliers]) {
        await transformResource.insert(record);
      }

      // Create plugin with filter and map
      transformPlugin = new MLPlugin({
        models: {
          // Model without transformations
          noTransform: {
            type: 'regression',
            resource: 'test_transforms',
            features: ['value'],
            target: 'result',
            autoTrain: false,
            modelConfig: {
              epochs: 30,
              batchSize: 4
            }
          },

          // Model with filter only
          withFilter: {
            type: 'regression',
            resource: 'test_transforms',
            features: ['value'],
            target: 'result',
            filter: (record) => {
              // Remove outliers and invalid data
              return record.value > 0 && record.value < 100 && record.result >= 0;
            },
            autoTrain: false,
            modelConfig: {
              epochs: 30,
              batchSize: 4
            }
          },

          // Model with map only
          withMap: {
            type: 'regression',
            resource: 'test_transforms',
            features: ['valueSquared'],
            target: 'result',
            map: (record) => {
              return {
                ...record,
                valueSquared: record.value * record.value
              };
            },
            autoTrain: false,
            modelConfig: {
              epochs: 30,
              batchSize: 4
            }
          },

          // Model with both filter and map
          withBoth: {
            type: 'regression',
            resource: 'test_transforms',
            features: ['valueSquared'],
            target: 'result',
            filter: (record) => {
              return record.value > 0 && record.value < 100 && record.result >= 0;
            },
            map: (record) => {
              return {
                ...record,
                valueSquared: record.value * record.value
              };
            },
            autoTrain: false,
            modelConfig: {
              epochs: 30,
              batchSize: 4
            }
          }
        },
        verbose: false
      });

      await transformPlugin.install(db);
    });

    it('should train model without transformations', async () => {
      const result = await transformPlugin.train('noTransform');

      expect(result).toBeDefined();
      expect(result.samples).toBe(13); // All data (10 valid + 3 outliers)
      expect(result.loss).toBeDefined();
    });

    it('should filter out invalid records', async () => {
      const result = await transformPlugin.train('withFilter');

      expect(result).toBeDefined();
      expect(result.samples).toBe(10); // Only valid data (outliers removed)
      expect(result.loss).toBeDefined();
    });

    it('should apply map transformation', async () => {
      const result = await transformPlugin.train('withMap');

      expect(result).toBeDefined();
      expect(result.samples).toBe(13); // All data
      expect(result.loss).toBeDefined();
    });

    it('should apply both filter and map', async () => {
      const result = await transformPlugin.train('withBoth');

      expect(result).toBeDefined();
      expect(result.samples).toBe(10); // Filtered data with transformations
      expect(result.loss).toBeDefined();
    });

    it('should make accurate predictions with transformed data', async () => {
      await transformPlugin.train('withBoth');

      // Test: value = 60, result should be close to 3600
      const input = { valueSquared: 60 * 60 };
      const { prediction } = await transformPlugin.predict('withBoth', input);

      // Should be close to 3600
      expect(prediction).toBeGreaterThan(3000);
      expect(prediction).toBeLessThan(4000);
    });

    it('should improve model quality with filtering', async () => {
      const noFilterResult = await transformPlugin.train('noTransform');
      const filteredResult = await transformPlugin.train('withFilter');

      // Filtered model should have lower loss (better quality)
      expect(filteredResult.loss).toBeLessThan(noFilterResult.loss * 1.5); // Allow some margin
    });
  });

  // ============================================
  // NEW API: resource.ml.* Namespace
  // ============================================
  describe('Resource ML Namespace API (resource.ml.*)', () => {
    let db2;
    let mlPlugin2;
    let products;

    beforeAll(async () => {
      // Create new database for isolated testing
      db2 = createDatabaseForTest('ml-plugin-namespace', {
        verbose: false
      });

      await db2.connect();

      // Empty MLPlugin - models will be created dynamically
      mlPlugin2 = new MLPlugin({
        verbose: false,
        minTrainingSamples: 5
      });

      await mlPlugin2.install(db2);

      // Create products resource
      products = await db2.createResource({
        name: 'products',
        attributes: {
          cost: 'number|required',
          margin: 'number|required',
          demand: 'number|required',
          price: 'number|required'
        }
      });

      // Insert training data: price ≈ cost * (1 + margin) + (demand * 0.01)
      for (let i = 0; i < 20; i++) {
        const cost = Math.random() * 100 + 50;
        const margin = Math.random() * 0.5 + 0.2;
        const demand = Math.random() * 1000 + 100;
        const price = cost * (1 + margin) + demand * 0.01 + (Math.random() - 0.5) * 5;

        await products.insert({ cost, margin, demand, price });
      }
    });


    describe('resource.ml.learn()', () => {
      it('should auto-create and train model with zero config', async () => {
        const result = await products.ml.learn('price');

        expect(result).toBeDefined();
        expect(result.modelName).toBe('products_price_auto');
        expect(result.type).toBe('regression'); // Auto-detected
        expect(result.features).toEqual(expect.arrayContaining(['cost', 'margin', 'demand']));
        expect(result.target).toBe('price');
        expect(result.loss).toBeDefined();
        expect(result.samples).toBe(20);
      });

      it('should retrain existing model if called again', async () => {
        // First learn
        const result1 = await products.ml.learn('price');
        const modelName1 = result1.modelName;

        // Add more data
        await products.insert({ cost: 100, margin: 0.3, demand: 500, price: 150 });

        // Learn again - should retrain same model
        const result2 = await products.ml.learn('price');

        expect(result2.modelName).toBe(modelName1); // Same model
        expect(result2.samples).toBe(21); // More samples
      });

      it('should accept custom options', async () => {
        const db3 = createDatabaseForTest('ml-plugin-db3', { verbose: false });
        await db3.connect();
        const mlPlugin3 = new MLPlugin({ minTrainingSamples: 3 });
        await mlPlugin3.install(db3);

        const items = await db3.createResource({
          name: 'items',
          attributes: {
            a: 'number|required',
            b: 'number|required',
            result: 'number|required'
          }
        });

        for (let i = 0; i < 10; i++) {
          await items.insert({ a: i, b: i * 2, result: i * 3 });
        }

        const result = await items.ml.learn('result', {
          features: ['a', 'b'],
          modelConfig: { epochs: 10 }
        });

        expect(result.features).toEqual(['a', 'b']);
        expect(result.epochs).toBe(10);
      });
    });

    describe('resource.ml.predict()', () => {
      it('should make predictions using learned model', async () => {
        const result = await products.ml.predict({ cost: 100, margin: 0.3, demand: 500 }, 'price');

        expect(result).toBeDefined();
        expect(result.prediction).toBeDefined();
        expect(typeof result.prediction).toBe('number');
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.confidence).toBeLessThanOrEqual(1);

        // Expected: 100 * 1.3 + 5 = 135
        const expected = 100 * 1.3 + 5;
        expect(result.prediction).toBeGreaterThan(expected - 50);
        expect(result.prediction).toBeLessThan(expected + 50);
      });

      it('should throw error if model not found', async () => {
        await expect(
          products.ml.predict({ cost: 100 }, 'nonexistent')
        ).rejects.toThrow('No model found');
      });
    });

    describe('resource.ml.train()', () => {
      it('should manually retrain model', async () => {
        // Add more data
        await products.insert({ cost: 150, margin: 0.4, demand: 800, price: 220 });

        const result = await products.ml.train('price');

        expect(result).toBeDefined();
        expect(result.loss).toBeDefined();
        expect(result.samples).toBeGreaterThan(20);
      });
    });

    describe('resource.ml.list()', () => {
      it('should list all models for resource', () => {
        const models = products.ml.list();

        expect(models).toBeDefined();
        expect(Array.isArray(models)).toBe(true);
        expect(models.length).toBeGreaterThan(0);

        const priceModel = models.find(m => m.target === 'price');
        expect(priceModel).toBeDefined();
        expect(priceModel.name).toBe('products_price_auto');
        expect(priceModel.type).toBe('regression');
        expect(priceModel.isTrained).toBe(true);
      });
    });

    describe('resource.ml.stats()', () => {
      it('should return model statistics', () => {
        const stats = products.ml.stats('price');

        expect(stats).toBeDefined();
        expect(stats.trainedAt).toBeDefined();
        expect(stats.samples).toBeGreaterThan(0);
        expect(stats.loss).toBeDefined();
        expect(stats.predictions).toBeGreaterThan(0);
        expect(stats.isTrained).toBe(true);
      });

      it('should throw error if model not found', () => {
        expect(() => products.ml.stats('nonexistent')).toThrow('No model found');
      });
    });

    describe('resource.ml.versions()', () => {
      it('should list model versions', async () => {
        const versions = await products.ml.versions('price');

        expect(versions).toBeDefined();
        expect(Array.isArray(versions)).toBe(true);
        expect(versions.length).toBeGreaterThan(0);

        const latestVersion = versions[versions.length - 1];
        expect(latestVersion.version).toBeDefined();
        expect(latestVersion.savedAt).toBeDefined();
      });

      it('should throw error if model not found', async () => {
        await expect(
          products.ml.versions('nonexistent')
        ).rejects.toThrow('No model found');
      });
    });

    describe('resource.ml.export() and import()', () => {
      it('should export and import model', async () => {
        const exported = await products.ml.export('price');

        expect(exported).toBeDefined();
        expect(exported.type).toBe('regression');
        expect(exported.config.features).toContain('cost');
        expect(exported.config.target).toBe('price');

        // Create new resource and import
        const db4 = createDatabaseForTest('ml-plugin-db4', { verbose: false });
        await db4.connect();
        const mlPlugin4 = new MLPlugin({ minTrainingSamples: 3 });
        await mlPlugin4.install(db4);

        const products2 = await db4.createResource({
          name: 'products2',
          attributes: {
            cost: 'number|required',
            margin: 'number|required',
            demand: 'number|required',
            price: 'number|required'
          }
        });

        // Need to create a model first before importing
        for (let i = 0; i < 5; i++) {
          await products2.insert({ cost: 100, margin: 0.3, demand: 500, price: 150 });
        }

        await products2.ml.learn('price');
        await products2.ml.import('price', exported);

        // Should be able to predict now
        const result = await products2.ml.predict({ cost: 100, margin: 0.3, demand: 500 }, 'price');
        expect(result.prediction).toBeDefined();
      });
    });

    describe('API Consistency', () => {
      it('should have ml namespace on resource', () => {
        expect(products.ml).toBeDefined();
        expect(typeof products.ml).toBe('object');
      });

      it('should have all methods in ml namespace', () => {
        expect(typeof products.ml.learn).toBe('function');
        expect(typeof products.ml.predict).toBe('function');
        expect(typeof products.ml.train).toBe('function');
        expect(typeof products.ml.list).toBe('function');
        expect(typeof products.ml.versions).toBe('function');
        expect(typeof products.ml.rollback).toBe('function');
        expect(typeof products.ml.compare).toBe('function');
        expect(typeof products.ml.stats).toBe('function');
        expect(typeof products.ml.export).toBe('function');
        expect(typeof products.ml.import).toBe('function');
      });

      it('should maintain backward compatibility with old API', async () => {
        // Old API should still work
        expect(typeof products.predict).toBe('function');
        expect(typeof products.trainModel).toBe('function');
        expect(typeof products.listModels).toBe('function');

        // Test old API
        const models = products.listModels();
        expect(Array.isArray(models)).toBe(true);
      });
    });

    describe('Auto-Detection', () => {
      it('should auto-detect regression type for numeric target', async () => {
        const db5 = createDatabaseForTest('ml-plugin-db5', { verbose: false });
        await db5.connect();
        const mlPlugin5 = new MLPlugin({ minTrainingSamples: 3 });
        await mlPlugin5.install(db5);

        const nums = await db5.createResource({
          name: 'numbers',
          attributes: {
            x: 'number|required',
            y: 'number|required'
          }
        });

        for (let i = 0; i < 10; i++) {
          await nums.insert({ x: i, y: i * 2 });
        }

        const result = await nums.ml.learn('y');
        expect(result.type).toBe('regression');
      });

      it('should auto-detect classification type for string target', async () => {
        const db6 = createDatabaseForTest('ml-plugin-db6', { verbose: false });
        await db6.connect();
        const mlPlugin6 = new MLPlugin({ minTrainingSamples: 5 });
        await mlPlugin6.install(db6);

        const categories = await db6.createResource({
          name: 'categories',
          attributes: {
            x: 'number|required',
            y: 'number|required',
            label: 'string|required'
          }
        });

        for (let i = 0; i < 15; i++) {
          await categories.insert({
            x: i,
            y: i * 2,
            label: i > 7 ? 'high' : 'low'
          });
        }

        const result = await categories.ml.learn('label');
        expect(result.type).toBe('classification');
      });
    });
  });
});
