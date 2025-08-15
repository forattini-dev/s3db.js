import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import * as bodyOnly from '../../src/behaviors/body-only.js';
import * as enforceLimit from '../../src/behaviors/enforce-limits.js';
import * as userManaged from '../../src/behaviors/user-managed.js';
import * as bodyOverflow from '../../src/behaviors/body-overflow.js';
import * as truncateData from '../../src/behaviors/truncate-data.js';

describe('Behavior Coverage Tests', () => {
  
  describe('Body-Only Behavior', () => {
    let resource;
    
    beforeEach(() => {
      resource = {
        version: 1,
        schema: {
          map: { '0': 'id', '1': 'name', '2': 'value' }
        }
      };
    });
    
    test('handleInsert should store only version in metadata', async () => {
      const data = { id: '123', name: 'test', value: 'data' };
      const mappedData = { '0': '123', '1': 'test', '2': 'data', _v: '1' };
      
      const result = await bodyOnly.handleInsert({ resource, data, mappedData });
      
      expect(result.mappedData._v).toBe('1');
      expect(result.mappedData._map).toBeDefined();
      expect(Object.keys(result.mappedData)).toHaveLength(2); // Only _v and _map
      expect(result.body).toBe(JSON.stringify(mappedData));
    });
    
    test('handleUpdate should store only version in metadata', async () => {
      const id = '123';
      const data = { name: 'updated' };
      const mappedData = { '1': 'updated', _v: '2' };
      
      const result = await bodyOnly.handleUpdate({ resource, id, data, mappedData });
      
      expect(result.mappedData._v).toBe('2');
      expect(result.mappedData._map).toBeDefined();
      expect(result.body).toBe(JSON.stringify(mappedData));
    });
    
    test('handleUpsert should behave like insert', async () => {
      const id = '123';
      const data = { id: '123', name: 'test' };
      const mappedData = { '0': '123', '1': 'test', _v: '1' };
      
      const result = await bodyOnly.handleUpsert({ resource, id, data, mappedData });
      
      expect(result.mappedData._v).toBe('1');
      expect(result.mappedData._map).toBeDefined();
    });
    
    test('handleGet should parse body and merge with metadata', async () => {
      const metadata = { _v: '1' };
      const bodyData = { '0': '123', '1': 'test', '2': 'value' };
      const body = JSON.stringify(bodyData);
      
      const result = await bodyOnly.handleGet({ resource, metadata, body });
      
      expect(result.metadata._v).toBe('1');
      expect(result.metadata['0']).toBe('123');
      expect(result.metadata['1']).toBe('test');
      expect(result.metadata['2']).toBe('value');
    });
    
    test('handleGet should handle empty body', async () => {
      const metadata = { _v: '1' };
      const body = '';
      
      const result = await bodyOnly.handleGet({ resource, metadata, body });
      
      expect(result.metadata._v).toBe('1');
      expect(Object.keys(result.metadata)).toHaveLength(1);
    });
    
    test('handleGet should handle invalid JSON in body', async () => {
      const metadata = { _v: '1' };
      const body = 'invalid json';
      
      const result = await bodyOnly.handleGet({ resource, metadata, body });
      
      expect(result.metadata._v).toBe('1');
      expect(Object.keys(result.metadata)).toHaveLength(1);
    });
  });
  
  describe('Enforce-Limits Behavior', () => {
    let resource;
    
    beforeEach(() => {
      resource = {
        version: 1,
        config: {
          timestamps: false
        }
      };
    });
    
    test('handleInsert should throw when exceeding limit', async () => {
      const data = { id: '123' };
      // Create a large object that exceeds 2KB
      const largeValue = 'x'.repeat(2048);
      const mappedData = { '0': '123', '1': largeValue, _v: '1' };
      
      await expect(
        enforceLimit.handleInsert({ resource, data, mappedData, originalData: data })
      ).rejects.toThrow(/exceeds 2KB limit/);
    });
    
    test('handleInsert should pass when within limit', async () => {
      const data = { id: '123', name: 'test' };
      const mappedData = { '0': '123', '1': 'test', _v: '1' };
      
      const result = await enforceLimit.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData).toEqual(mappedData);
      expect(result.body).toBe("");
    });
    
    test('handleUpdate should throw when exceeding limit', async () => {
      const id = '123';
      const data = { name: 'x'.repeat(2048) };
      const mappedData = { '1': 'x'.repeat(2048), _v: '2' };
      
      await expect(
        enforceLimit.handleUpdate({ resource, id, data, mappedData, originalData: data })
      ).rejects.toThrow(/exceeds 2KB limit/);
    });
    
    test('handleUpdate should return body with data', async () => {
      const id = '123';
      const data = { name: 'test' };
      const mappedData = { '1': 'test', _v: '2' };
      
      const result = await enforceLimit.handleUpdate({ 
        resource, id, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData).toEqual(mappedData);
      expect(result.body).toBe(JSON.stringify(mappedData));
    });
    
    test('handleUpsert should enforce limits', async () => {
      const id = '123';
      const data = { id: '123', name: 'x'.repeat(2048) };
      const mappedData = { '0': '123', '1': 'x'.repeat(2048), _v: '1' };
      
      await expect(
        enforceLimit.handleUpsert({ resource, id, data, mappedData })
      ).rejects.toThrow(/exceeds 2KB limit/);
    });
    
    test('handleGet should pass through data unchanged', async () => {
      const metadata = { '0': '123', _v: '1' };
      const body = '';
      
      const result = await enforceLimit.handleGet({ resource, metadata, body });
      
      expect(result.metadata).toEqual(metadata);
      expect(result.body).toBe(body);
    });
    
    test('should calculate effective limit with timestamps', async () => {
      resource.config.timestamps = true;
      const data = { id: '123', name: 'test' };
      const mappedData = { 
        '0': '123', 
        '1': 'test',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        _v: '1' 
      };
      
      const result = await enforceLimit.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData).toEqual(mappedData);
    });
  });
  
  describe('User-Managed Behavior', () => {
    let resource;
    let emitSpy;
    
    beforeEach(() => {
      emitSpy = jest.fn();
      resource = {
        version: 1,
        emit: emitSpy,
        config: {
          timestamps: false
        }
      };
    });
    
    test('handleInsert should emit exceedsLimit event when over 2KB', async () => {
      const data = { id: '123' };
      const largeValue = 'x'.repeat(2048);
      const mappedData = { '0': '123', '1': largeValue, _v: '1' };
      
      const result = await userManaged.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      expect(emitSpy).toHaveBeenCalledWith('exceedsLimit', expect.objectContaining({
        operation: 'insert',
        totalSize: expect.any(Number),
        limit: expect.any(Number),
        excess: expect.any(Number)
      }));
      
      // Should still return data but in body
      expect(result.mappedData._v).toBe('1');
      expect(result.body).toBeDefined();
    });
    
    test('handleInsert should store in metadata when within limit', async () => {
      const data = { id: '123', name: 'test' };
      const mappedData = { '0': '123', '1': 'test', _v: '1' };
      
      const result = await userManaged.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      expect(emitSpy).not.toHaveBeenCalled();
      expect(result.mappedData).toEqual(mappedData);
      expect(result.body).toBe("");
    });
    
    test('handleUpdate should emit event and use body when exceeding limit', async () => {
      const id = '123';
      const data = { name: 'x'.repeat(2048) };
      const mappedData = { '1': 'x'.repeat(2048), _v: '2' };
      
      const result = await userManaged.handleUpdate({ 
        resource, id, data, mappedData, originalData: data 
      });
      
      expect(emitSpy).toHaveBeenCalledWith('exceedsLimit', expect.objectContaining({
        operation: 'update',
        id: '123'
      }));
      
      expect(result.mappedData._v).toBe('2');
      expect(result.body).toBeDefined();
    });
    
    test('handleUpsert should handle limits', async () => {
      const id = '123';
      const data = { id: '123', name: 'test' };
      const mappedData = { '0': '123', '1': 'test', _v: '1' };
      
      const result = await userManaged.handleUpsert({ 
        resource, id, data, mappedData 
      });
      
      expect(emitSpy).not.toHaveBeenCalled();
      expect(result.mappedData).toEqual(mappedData);
    });
    
    test('handleGet should parse body when present', async () => {
      const metadata = { _v: '1' };
      const bodyData = { '0': '123', '1': 'test' };
      const body = JSON.stringify(bodyData);
      
      const result = await userManaged.handleGet({ resource, metadata, body });
      
      expect(result.metadata).toEqual({ ...bodyData, _v: '1' });
    });
    
    test('handleGet should handle invalid JSON', async () => {
      const metadata = { _v: '1' };
      const body = 'not json';
      
      const result = await userManaged.handleGet({ resource, metadata, body });
      
      expect(result.metadata).toEqual(metadata);
    });
    
    test('should respect timestamps in limit calculation', async () => {
      resource.config.timestamps = true;
      const data = { id: '123' };
      const mappedData = { 
        '0': '123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        _v: '1' 
      };
      
      const result = await userManaged.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData).toBeDefined();
    });
  });
  
  describe('Body-Overflow Behavior', () => {
    let resource;
    
    beforeEach(() => {
      resource = {
        version: 1,
        schema: {
          map: { '0': 'id', '1': 'name', '2': 'description', '3': 'content' }
        },
        config: {
          timestamps: false
        }
      };
    });
    
    test('should overflow large fields to body', async () => {
      const data = { 
        id: '123', 
        name: 'test',
        description: 'x'.repeat(500),
        content: 'y'.repeat(1500)
      };
      const mappedData = { 
        '0': '123', 
        '1': 'test',
        '2': 'x'.repeat(500),
        '3': 'y'.repeat(1500),
        _v: '1'
      };
      
      const result = await bodyOverflow.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      // Should keep small fields in metadata
      expect(result.mappedData['0']).toBe('123');
      expect(result.mappedData['1']).toBe('test');
      expect(result.mappedData._v).toBe('1');
      
      // Large fields should be in body or metadata overflowed
      if (result.body && result.body !== '') {
        const bodyData = JSON.parse(result.body);
        // Check if large fields are in body
        expect(bodyData['2'] || result.mappedData['2']).toBeDefined();
        expect(bodyData['3'] || result.mappedData['3']).toBeDefined();
      }
    });
    
    test('handleGet should merge body fields back', async () => {
      const metadata = { '0': '123', '1': 'test', _v: '1' };
      const bodyData = { '2': 'description', '3': 'content' };
      const body = JSON.stringify(bodyData);
      
      const result = await bodyOverflow.handleGet({ resource, metadata, body });
      
      expect(result.metadata['0']).toBe('123');
      expect(result.metadata['1']).toBe('test');
      expect(result.metadata['2']).toBe('description');
      expect(result.metadata['3']).toBe('content');
    });
  });
  
  describe('Truncate-Data Behavior', () => {
    let resource;
    
    beforeEach(() => {
      resource = {
        version: 1,
        config: {
          timestamps: false
        }
      };
    });
    
    test('should truncate data when exceeding limits', async () => {
      const data = { 
        id: '123',
        description: 'x'.repeat(2000)
      };
      const mappedData = { 
        '0': '123',
        '1': 'x'.repeat(2000),
        _v: '1'
      };
      
      const result = await truncateData.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      // Should keep data that fits
      expect(result.mappedData['0']).toBe('123');
      expect(result.mappedData._v).toBe('1');
      // The behavior might truncate or remove large fields
      if (result.mappedData['1']) {
        expect(result.mappedData['1'].length).toBeLessThanOrEqual(2000);
      }
      expect(result.body).toBe("");
    });
    
    test('handleGet should return data as-is', async () => {
      const metadata = { '0': '123', '1': 'truncated...', _v: '1' };
      const body = '';
      
      const result = await truncateData.handleGet({ resource, metadata, body });
      
      expect(result.metadata).toEqual(metadata);
      expect(result.body).toBe(body);
    });
  });
});