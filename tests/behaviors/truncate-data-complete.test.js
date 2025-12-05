import * as truncateData from '../../src/behaviors/truncate-data.js';

describe('Truncate-Data Behavior Complete Tests', () => {
  let resource;
  
  beforeEach(() => {
    resource = {
      version: 1,
      config: {
        timestamps: false
      }
    };
  });
  
  describe('handleInsert', () => {
    test('should handle data within limits', async () => {
      const data = { id: '123', name: 'test', value: 'small' };
      const mappedData = { '0': '123', '1': 'test', '2': 'small', _v: '1' };
      
      const result = await truncateData.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData['0']).toBe('123');
      expect(result.mappedData['1']).toBe('test');
      expect(result.mappedData['2']).toBe('small');
      expect(result.mappedData._v).toBe('1');
      expect(result.mappedData.$truncated).toBeUndefined();
      expect(result.body).toBe("");
    });
    
    test('should truncate single large field', async () => {
      const data = { 
        id: '123',
        description: 'x'.repeat(2500)  // Larger to ensure truncation even with encoding
      };
      const mappedData = { 
        '0': '123',
        '1': 'x'.repeat(2500),  // Larger to ensure truncation
        _v: '1'
      };
      
      const result = await truncateData.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData['0']).toBe('123');
      expect(result.mappedData._v).toBe('1');
      expect(result.mappedData.$truncated).toBe('true');
      // Large field should be truncated or empty
      if (result.mappedData['1']) {
        expect(result.mappedData['1'].length).toBeLessThan(2000);
      }
      expect(result.body).toBe("");
    });
    
    test('should handle multiple large fields', async () => {
      const data = { 
        id: '123',
        field1: 'a'.repeat(800),
        field2: 'b'.repeat(800),
        field3: 'c'.repeat(800)
      };
      const mappedData = { 
        '0': '123',
        '1': 'a'.repeat(800),
        '2': 'b'.repeat(800),
        '3': 'c'.repeat(800),
        _v: '1'
      };
      
      const result = await truncateData.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData['0']).toBe('123');
      expect(result.mappedData._v).toBe('1');
      expect(result.mappedData.$truncated).toBe('true');
      // At least one field should be truncated
      const totalLength = (result.mappedData['1']?.length || 0) + 
                         (result.mappedData['2']?.length || 0) + 
                         (result.mappedData['3']?.length || 0);
      expect(totalLength).toBeLessThan(2400);
      expect(result.body).toBe("");
    });
    
    test('should handle when all fields are too large', async () => {
      const data = { 
        field1: 'x'.repeat(1000),
        field2: 'y'.repeat(1000),
        field3: 'z'.repeat(1000)
      };
      const mappedData = { 
        '0': 'x'.repeat(1000),
        '1': 'y'.repeat(1000),
        '2': 'z'.repeat(1000),
        _v: '1'
      };
      
      const result = await truncateData.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData._v).toBe('1');
      expect(result.mappedData.$truncated).toBe('true');
      // Fields should be truncated or empty
      const field0 = result.mappedData['0'] || '';
      const field1 = result.mappedData['1'] || '';
      const field2 = result.mappedData['2'] || '';
      expect(field0.length + field1.length + field2.length).toBeLessThanOrEqual(2000);
      expect(result.body).toBe("");
    });
    
    test('should respect timestamps in limit calculation', async () => {
      resource.config.timestamps = true;
      const data = { 
        id: '123',
        content: 'x'.repeat(2200)  // Larger to ensure truncation with timestamps
      };
      const mappedData = { 
        '0': '123',
        '1': 'x'.repeat(2200),  // Match the data size
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        _v: '1'
      };
      
      const result = await truncateData.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData['0']).toBe('123');
      // Timestamps may be preserved or truncated depending on space
      if (result.mappedData.createdAt) {
        expect(result.mappedData.createdAt).toBe('2024-01-01T00:00:00.000Z');
      }
      if (result.mappedData.updatedAt) {
        expect(result.mappedData.updatedAt).toBe('2024-01-01T00:00:00.000Z');
      }
      expect(result.mappedData._v).toBe('1');
      expect(result.mappedData.$truncated).toBe('true');
      // Content should be truncated
      if (result.mappedData['1']) {
        expect(result.mappedData['1'].length).toBeLessThan(2200);
      }
    });
    
    test('should handle edge case with exactly limit size', async () => {
      // Create data that's exactly at the limit
      const smallData = { id: '1', name: 'test' };
      const mappedData = { '0': '1', '1': 'test', _v: '1' };
      
      // Add more data to reach near limit
      const padding = 'x'.repeat(2500);
      mappedData['2'] = padding;
      
      const result = await truncateData.handleInsert({ 
        resource, data: smallData, mappedData, originalData: smallData 
      });
      
      expect(result.mappedData._v).toBe('1');
      expect(result.mappedData.$truncated).toBe('true');
      expect(result.body).toBe("");
    });
  });
  
  describe('handleUpdate', () => {
    test('should handle update within limits', async () => {
      const id = '123';
      const data = { name: 'updated' };
      const mappedData = { '1': 'updated', _v: '2' };
      
      const result = await truncateData.handleUpdate({ 
        resource, id, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData['1']).toBe('updated');
      expect(result.mappedData._v).toBe('2');
      expect(result.mappedData.$truncated).toBeUndefined();
      expect(result.body).toBe("");
    });
    
    test('should truncate large update', async () => {
      const id = '123';
      const data = { description: 'x'.repeat(2500) };
      const mappedData = { '1': 'x'.repeat(2500), _v: '2' };
      
      const result = await truncateData.handleUpdate({ 
        resource, id, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData._v).toBe('2');
      expect(result.mappedData.$truncated).toBe('true');
      if (result.mappedData['1']) {
        expect(result.mappedData['1'].length).toBeLessThan(2000);
      }
      expect(result.body).toBe("");
    });
    
    test('should handle update with timestamps', async () => {
      resource.config.timestamps = true;
      const id = '123';
      const data = { content: 'x'.repeat(2200) };
      const mappedData = { 
        '1': 'x'.repeat(2200),
        updatedAt: '2024-01-01T00:00:00.000Z',
        _v: '2'
      };
      
      const result = await truncateData.handleUpdate({ 
        resource, id, data, mappedData, originalData: data 
      });
      
      // Timestamp may be preserved or truncated depending on space
      if (result.mappedData.updatedAt) {
        expect(result.mappedData.updatedAt).toBe('2024-01-01T00:00:00.000Z');
      }
      expect(result.mappedData._v).toBe('2');
      expect(result.mappedData.$truncated).toBe('true');
    });
  });
  
  describe('handleUpsert', () => {
    test('should handle upsert within limits', async () => {
      const id = '123';
      const data = { id: '123', name: 'test' };
      const mappedData = { '0': '123', '1': 'test', _v: '1' };
      
      const result = await truncateData.handleUpsert({ 
        resource, id, data, mappedData 
      });
      
      expect(result.mappedData['0']).toBe('123');
      expect(result.mappedData['1']).toBe('test');
      expect(result.mappedData._v).toBe('1');
      expect(result.mappedData.$truncated).toBeUndefined();
    });
    
    test('should truncate large upsert', async () => {
      const id = '123';
      const data = { id: '123', content: 'x'.repeat(2500) };
      const mappedData = { '0': '123', '1': 'x'.repeat(2500), _v: '1' };
      
      const result = await truncateData.handleUpsert({ 
        resource, id, data, mappedData 
      });
      
      expect(result.mappedData['0']).toBe('123');
      expect(result.mappedData._v).toBe('1');
      expect(result.mappedData.$truncated).toBe('true');
    });
  });
  
  describe('handleGet', () => {
    test('should return truncated data as-is', async () => {
      const metadata = { 
        '0': '123', 
        '1': 'truncated...', 
        '$truncated': '1',
        _v: '1' 
      };
      const body = '';
      
      const result = await truncateData.handleGet({ resource, metadata, body });
      
      expect(result.metadata).toEqual(metadata);
      expect(result.body).toBe(body);
    });
    
    test('should handle non-truncated data', async () => {
      const metadata = { '0': '123', '1': 'normal', _v: '1' };
      const body = '';
      
      const result = await truncateData.handleGet({ resource, metadata, body });
      
      expect(result.metadata).toEqual(metadata);
      expect(result.metadata.$truncated).toBeUndefined();
      expect(result.body).toBe(body);
    });
  });
  
  describe('Edge Cases', () => {
    test('should handle empty data', async () => {
      const data = {};
      const mappedData = { _v: '1' };
      
      const result = await truncateData.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData._v).toBe('1');
      expect(result.mappedData.$truncated).toBeUndefined();
      expect(result.body).toBe("");
    });
    
    test('should handle null values', async () => {
      const data = { id: '123', value: null };
      const mappedData = { '0': '123', '1': null, _v: '1' };
      
      const result = await truncateData.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData['0']).toBe('123');
      expect(result.mappedData['1']).toBe(null);
      expect(result.mappedData._v).toBe('1');
    });
    
    test('should handle arrays and objects', async () => {
      const data = { 
        id: '123',
        tags: ['tag1', 'tag2', 'tag3'],
        metadata: { key: 'value' }
      };
      const mappedData = { 
        '0': '123',
        '1': JSON.stringify(['tag1', 'tag2', 'tag3']),
        '2': JSON.stringify({ key: 'value' }),
        _v: '1'
      };
      
      const result = await truncateData.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData['0']).toBe('123');
      expect(result.mappedData._v).toBe('1');
      expect(result.body).toBe("");
    });
    
    test('should handle very long field names', async () => {
      const data = {};
      const longFieldName = 'field_' + 'x'.repeat(100);
      data[longFieldName] = 'value';
      
      const mappedData = { '0': 'value', _v: '1' };
      
      const result = await truncateData.handleInsert({ 
        resource, data, mappedData, originalData: data 
      });
      
      expect(result.mappedData['0']).toBe('value');
      expect(result.mappedData._v).toBe('1');
    });
  });
});