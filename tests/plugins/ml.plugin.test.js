/**
 * ML Plugin Tests
 *
 * Tests for the Machine Learning Plugin
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Database, MLPlugin } from '../../src/index.js';

describe('MLPlugin', () => {
  let db;
  let mlPlugin;

  beforeAll(async () => {
    // Create database with memory client
    db = new Database({
      client: 'memory',
      verbose: false
    });

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

    await db.install(mlPlugin);
    await db.start();
  });

  afterAll(async () => {
    if (db) {
      await db.stop();
    }
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
        await db.install(badPlugin);
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

      await db.install(minPlugin);

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
});
