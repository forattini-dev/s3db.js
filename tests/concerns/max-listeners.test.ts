import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SafeEventEmitter } from '../../src/concerns/safe-event-emitter.js';

describe('MaxListeners Warning Prevention', () => {
  let originalMaxListeners: number;
  let warningHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalMaxListeners = process.getMaxListeners();
    warningHandler = vi.fn();
    process.on('warning', warningHandler);
  });

  afterEach(() => {
    process.removeListener('warning', warningHandler);
    process.setMaxListeners(originalMaxListeners);
  });

  describe('SafeEventEmitter', () => {
    it('should increment maxListeners on construction with autoCleanup', () => {
      const initialMax = process.getMaxListeners();
      const emitter = new SafeEventEmitter({ autoCleanup: true });

      expect(process.getMaxListeners()).toBe(initialMax + 3);

      emitter.destroy();
      expect(process.getMaxListeners()).toBe(initialMax);
    });

    it('should decrement maxListeners on destroy()', () => {
      const initialMax = process.getMaxListeners();
      const emitter = new SafeEventEmitter({ autoCleanup: true });

      emitter.destroy();

      expect(process.getMaxListeners()).toBe(initialMax);
    });

    it('should decrement maxListeners on removeSignalHandlers()', () => {
      const initialMax = process.getMaxListeners();
      const emitter = new SafeEventEmitter({ autoCleanup: true });

      emitter.removeSignalHandlers();

      expect(process.getMaxListeners()).toBe(initialMax);
    });

    it('should not go below zero maxListeners', () => {
      process.setMaxListeners(1);
      const emitter = new SafeEventEmitter({ autoCleanup: true });

      emitter.destroy();
      emitter.destroy();
      emitter.destroy();

      expect(process.getMaxListeners()).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple emitters without warning', () => {
      const emitters: SafeEventEmitter[] = [];

      for (let i = 0; i < 20; i++) {
        emitters.push(new SafeEventEmitter({ autoCleanup: true }));
      }

      expect(warningHandler).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'MaxListenersExceededWarning' })
      );

      for (const emitter of emitters) {
        emitter.destroy();
      }
    });

    it('should handle create/destroy cycle without listener accumulation', () => {
      const initialMax = process.getMaxListeners();

      for (let i = 0; i < 10; i++) {
        const emitter = new SafeEventEmitter({ autoCleanup: true });
        emitter.destroy();
      }

      expect(process.getMaxListeners()).toBe(initialMax);
      expect(warningHandler).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'MaxListenersExceededWarning' })
      );
    });
  });

  describe('bumpProcessMaxListeners', () => {
    it('should handle negative delta', async () => {
      const { bumpProcessMaxListeners } = await import('../../src/concerns/process-max-listeners.js');

      const initialMax = process.getMaxListeners();

      bumpProcessMaxListeners(5);
      expect(process.getMaxListeners()).toBe(initialMax + 5);

      bumpProcessMaxListeners(-3);
      expect(process.getMaxListeners()).toBe(initialMax + 2);

      bumpProcessMaxListeners(-2);
      expect(process.getMaxListeners()).toBe(initialMax);
    });

    it('should not go below zero with large negative delta', async () => {
      const { bumpProcessMaxListeners } = await import('../../src/concerns/process-max-listeners.js');

      process.setMaxListeners(5);

      bumpProcessMaxListeners(-100);

      expect(process.getMaxListeners()).toBe(0);
    });

    it('should ignore delta of zero', async () => {
      const { bumpProcessMaxListeners } = await import('../../src/concerns/process-max-listeners.js');

      const initialMax = process.getMaxListeners();

      bumpProcessMaxListeners(0);

      expect(process.getMaxListeners()).toBe(initialMax);
    });
  });
});
