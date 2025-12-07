import { 
  behaviors, 
  getBehavior, 
  AVAILABLE_BEHAVIORS, 
  DEFAULT_BEHAVIOR 
} from '../../../src/behaviors/index.js';
import * as userManaged from '../../../src/behaviors/user-managed.js';
import * as enforceLimits from '../../../src/behaviors/enforce-limits.js';
import * as dataTruncate from '../../../src/behaviors/truncate-data.js';
import * as bodyOverflow from '../../../src/behaviors/body-overflow.js';
import * as bodyOnly from '../../../src/behaviors/body-only.js';

describe('Behaviors Index', () => {
  
  describe('behaviors export', () => {
    test('should export all behaviors', () => {
      expect(behaviors).toBeDefined();
      expect(behaviors['user-managed']).toBe(userManaged);
      expect(behaviors['enforce-limits']).toBe(enforceLimits);
      expect(behaviors['truncate-data']).toBe(dataTruncate);
      expect(behaviors['body-overflow']).toBe(bodyOverflow);
      expect(behaviors['body-only']).toBe(bodyOnly);
    });
    
    test('should have exactly 5 behaviors', () => {
      expect(Object.keys(behaviors)).toHaveLength(5);
    });
    
    test('all behaviors should have required handler functions', () => {
      Object.entries(behaviors).forEach(([name, behavior]) => {
        expect(behavior.handleInsert).toBeDefined();
        expect(typeof behavior.handleInsert).toBe('function');
        expect(behavior.handleUpdate).toBeDefined();
        expect(typeof behavior.handleUpdate).toBe('function');
        expect(behavior.handleUpsert).toBeDefined();
        expect(typeof behavior.handleUpsert).toBe('function');
        expect(behavior.handleGet).toBeDefined();
        expect(typeof behavior.handleGet).toBe('function');
      });
    });
  });
  
  describe('getBehavior function', () => {
    test('should return user-managed behavior', () => {
      const behavior = getBehavior('user-managed');
      expect(behavior).toBe(userManaged);
      expect(behavior.handleInsert).toBeDefined();
    });
    
    test('should return enforce-limits behavior', () => {
      const behavior = getBehavior('enforce-limits');
      expect(behavior).toBe(enforceLimits);
      expect(behavior.handleInsert).toBeDefined();
    });
    
    test('should return truncate-data behavior', () => {
      const behavior = getBehavior('truncate-data');
      expect(behavior).toBe(dataTruncate);
      expect(behavior.handleInsert).toBeDefined();
    });
    
    test('should return body-overflow behavior', () => {
      const behavior = getBehavior('body-overflow');
      expect(behavior).toBe(bodyOverflow);
      expect(behavior.handleInsert).toBeDefined();
    });
    
    test('should return body-only behavior', () => {
      const behavior = getBehavior('body-only');
      expect(behavior).toBe(bodyOnly);
      expect(behavior.handleInsert).toBeDefined();
    });
    
    test('should throw error for unknown behavior', () => {
      expect(() => getBehavior('unknown-behavior')).toThrow(/Unknown behavior: unknown-behavior/);
    });
    
    test('should include available behaviors in error message', () => {
      try {
        getBehavior('invalid');
      } catch (error) {
        const errorText = error.description || error.message;
        expect(errorText).toContain('user-managed');
        expect(errorText).toContain('enforce-limits');
        expect(errorText).toContain('truncate-data');
        expect(errorText).toContain('body-overflow');
        expect(errorText).toContain('body-only');
      }
    });
    
    test('should handle null behavior name', () => {
      expect(() => getBehavior(null)).toThrow(/Unknown behavior/);
    });
    
    test('should handle undefined behavior name', () => {
      expect(() => getBehavior(undefined)).toThrow(/Unknown behavior/);
    });
    
    test('should handle empty string behavior name', () => {
      expect(() => getBehavior('')).toThrow(/Unknown behavior/);
    });
  });
  
  describe('AVAILABLE_BEHAVIORS constant', () => {
    test('should list all available behaviors', () => {
      expect(AVAILABLE_BEHAVIORS).toBeDefined();
      expect(Array.isArray(AVAILABLE_BEHAVIORS)).toBe(true);
      expect(AVAILABLE_BEHAVIORS).toHaveLength(5);
      expect(AVAILABLE_BEHAVIORS).toContain('user-managed');
      expect(AVAILABLE_BEHAVIORS).toContain('enforce-limits');
      expect(AVAILABLE_BEHAVIORS).toContain('truncate-data');
      expect(AVAILABLE_BEHAVIORS).toContain('body-overflow');
      expect(AVAILABLE_BEHAVIORS).toContain('body-only');
    });
    
    test('should match keys of behaviors object', () => {
      expect(AVAILABLE_BEHAVIORS).toEqual(Object.keys(behaviors));
    });
  });
  
  describe('DEFAULT_BEHAVIOR constant', () => {
    test('should be user-managed', () => {
      expect(DEFAULT_BEHAVIOR).toBe('user-managed');
    });
    
    test('should be a valid behavior', () => {
      expect(AVAILABLE_BEHAVIORS).toContain(DEFAULT_BEHAVIOR);
      expect(() => getBehavior(DEFAULT_BEHAVIOR)).not.toThrow();
    });
    
    test('default behavior should have all handlers', () => {
      const defaultBehavior = getBehavior(DEFAULT_BEHAVIOR);
      expect(defaultBehavior.handleInsert).toBeDefined();
      expect(defaultBehavior.handleUpdate).toBeDefined();
      expect(defaultBehavior.handleUpsert).toBeDefined();
      expect(defaultBehavior.handleGet).toBeDefined();
    });
  });
  
  describe('Integration', () => {
    test('all exported behaviors should be retrievable via getBehavior', () => {
      AVAILABLE_BEHAVIORS.forEach(behaviorName => {
        const behaviorViaGet = getBehavior(behaviorName);
        const behaviorDirect = behaviors[behaviorName];
        expect(behaviorViaGet).toBe(behaviorDirect);
      });
    });
    
    test('behaviors should be immutable references', () => {
      const behavior1 = getBehavior('user-managed');
      const behavior2 = getBehavior('user-managed');
      expect(behavior1).toBe(behavior2);
      expect(behavior1 === behavior2).toBe(true);
    });
  });
});