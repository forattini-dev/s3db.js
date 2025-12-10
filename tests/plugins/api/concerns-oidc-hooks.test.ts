import { describe, test, expect, vi } from 'vitest';
import {
  HOOK_DEFINITIONS,
  HookExecutor,
  createHookExecutor
} from '../../../src/plugins/api/concerns/oidc-hooks.js';

describe('HOOK_DEFINITIONS', () => {
  describe('login phase hooks', () => {
    test('beforeLogin can modify params', () => {
      expect(HOOK_DEFINITIONS.beforeLogin.phase).toBe('login');
      expect(HOOK_DEFINITIONS.beforeLogin.canModify).toBe(true);
      expect(HOOK_DEFINITIONS.beforeLogin.errorHook).toBe('onError');
    });

    test('afterLogin cannot modify params', () => {
      expect(HOOK_DEFINITIONS.afterLogin.canModify).toBe(false);
    });
  });

  describe('callback phase hooks', () => {
    test('afterTokenDecode can modify params', () => {
      expect(HOOK_DEFINITIONS.afterTokenDecode.phase).toBe('callback');
      expect(HOOK_DEFINITIONS.afterTokenDecode.canModify).toBe(true);
      expect(HOOK_DEFINITIONS.afterTokenDecode.errorHook).toBe('onTokenValidationError');
    });

    test('beforeUserCreate can modify params', () => {
      expect(HOOK_DEFINITIONS.beforeUserCreate.canModify).toBe(true);
    });

    test('afterUserCreate cannot modify params', () => {
      expect(HOOK_DEFINITIONS.afterUserCreate.canModify).toBe(false);
    });
  });

  describe('middleware phase hooks', () => {
    test('afterSessionDecode can modify params', () => {
      expect(HOOK_DEFINITIONS.afterSessionDecode.phase).toBe('middleware');
      expect(HOOK_DEFINITIONS.afterSessionDecode.canModify).toBe(true);
    });

    test('beforeTokenRefresh cannot modify params', () => {
      expect(HOOK_DEFINITIONS.beforeTokenRefresh.canModify).toBe(false);
    });
  });

  describe('logout phase hooks', () => {
    test('beforeIdpLogout can modify params', () => {
      expect(HOOK_DEFINITIONS.beforeIdpLogout.phase).toBe('logout');
      expect(HOOK_DEFINITIONS.beforeIdpLogout.canModify).toBe(true);
    });
  });

  describe('error hooks', () => {
    test('error hooks have no errorHook', () => {
      expect(HOOK_DEFINITIONS.onError.errorHook).toBeNull();
      expect(HOOK_DEFINITIONS.onCallbackError.errorHook).toBeNull();
      expect(HOOK_DEFINITIONS.onTokenExchangeError.errorHook).toBeNull();
    });

    test('onUserNotFound can modify params', () => {
      expect(HOOK_DEFINITIONS.onUserNotFound.phase).toBe('error');
      expect(HOOK_DEFINITIONS.onUserNotFound.canModify).toBe(true);
    });

    test('onError cannot modify params', () => {
      expect(HOOK_DEFINITIONS.onError.canModify).toBe(false);
    });
  });

  describe('all hooks have required fields', () => {
    test('every hook has phase, canModify, and errorHook', () => {
      Object.entries(HOOK_DEFINITIONS).forEach(([name, def]) => {
        expect(def).toHaveProperty('phase');
        expect(def).toHaveProperty('canModify');
        expect(def).toHaveProperty('errorHook');
        expect(typeof def.phase).toBe('string');
        expect(typeof def.canModify).toBe('boolean');
      });
    });
  });
});

describe('HookExecutor', () => {
  describe('getHooks', () => {
    test('returns empty array when no hooks configured', () => {
      const executor = new HookExecutor({});
      expect(executor.getHooks('beforeLogin')).toEqual([]);
    });

    test('returns single hook as array', () => {
      const hook = vi.fn();
      const executor = new HookExecutor({ hooks: { beforeLogin: hook } });
      expect(executor.getHooks('beforeLogin')).toEqual([hook]);
    });

    test('returns array of hooks as-is', () => {
      const hook1 = vi.fn();
      const hook2 = vi.fn();
      const executor = new HookExecutor({ hooks: { beforeLogin: [hook1, hook2] } });
      expect(executor.getHooks('beforeLogin')).toEqual([hook1, hook2]);
    });
  });

  describe('executeHooks', () => {
    test('returns params unchanged when no hooks', async () => {
      const executor = new HookExecutor({});
      const params = { userId: '123' };
      const result = await executor.executeHooks('beforeLogin', params);
      expect(result).toEqual(params);
    });

    test('executes single hook', async () => {
      const hook = vi.fn().mockResolvedValue({ extra: 'data' });
      const executor = new HookExecutor({ hooks: { beforeLogin: hook } });

      const result = await executor.executeHooks('beforeLogin', { userId: '123' });

      expect(hook).toHaveBeenCalledWith({ userId: '123' });
      expect(result).toEqual({ userId: '123', extra: 'data' });
    });

    test('executes multiple hooks in order', async () => {
      const order: number[] = [];
      const hook1 = vi.fn().mockImplementation(async () => { order.push(1); return { step1: true }; });
      const hook2 = vi.fn().mockImplementation(async () => { order.push(2); return { step2: true }; });

      const executor = new HookExecutor({ hooks: { beforeLogin: [hook1, hook2] } });
      const result = await executor.executeHooks('beforeLogin', { initial: true });

      expect(order).toEqual([1, 2]);
      expect(result).toEqual({ initial: true, step1: true, step2: true });
    });

    test('merges hook results when canModify is true', async () => {
      const hook = vi.fn().mockResolvedValue({ newField: 'value' });
      const executor = new HookExecutor({ hooks: { beforeLogin: hook } });

      const result = await executor.executeHooks('beforeLogin', { existing: 'data' });

      expect(result).toEqual({ existing: 'data', newField: 'value' });
    });

    test('does not merge when canModify is false', async () => {
      const hook = vi.fn().mockResolvedValue({ shouldNotMerge: true });
      const executor = new HookExecutor({ hooks: { afterLogin: hook } });

      const result = await executor.executeHooks('afterLogin', { existing: 'data' });

      expect(result).toEqual({ existing: 'data' });
    });

    test('handles hook returning void', async () => {
      const hook = vi.fn().mockResolvedValue(undefined);
      const executor = new HookExecutor({ hooks: { beforeLogin: hook } });

      const result = await executor.executeHooks('beforeLogin', { data: 'test' });

      expect(result).toEqual({ data: 'test' });
    });

    test('continues on hook error by default', async () => {
      const hook1 = vi.fn().mockRejectedValue(new Error('Hook 1 failed'));
      const hook2 = vi.fn().mockResolvedValue({ hook2: 'ran' });

      const executor = new HookExecutor({ hooks: { beforeLogin: [hook1, hook2] } });
      const result = await executor.executeHooks('beforeLogin', { initial: true });

      expect(hook2).toHaveBeenCalled();
      expect(result).toEqual({ initial: true, hook2: 'ran' });
    });

    test('stops on error when stopOnError is true', async () => {
      const hook1 = vi.fn().mockRejectedValue(new Error('Hook 1 failed'));
      const hook2 = vi.fn().mockResolvedValue({ hook2: 'ran' });

      const executor = new HookExecutor({ hooks: { beforeLogin: [hook1, hook2] } });

      await expect(
        executor.executeHooks('beforeLogin', { initial: true }, { stopOnError: true })
      ).rejects.toThrow('Hook 1 failed');

      expect(hook2).not.toHaveBeenCalled();
    });

    test('returns original params for unknown hook', async () => {
      const executor = new HookExecutor({});
      const params = { data: 'test' };
      const result = await executor.executeHooks('unknownHook', params);
      expect(result).toEqual(params);
    });
  });

  describe('executeErrorHook', () => {
    test('returns null when no error hooks', async () => {
      const executor = new HookExecutor({});
      const result = await executor.executeErrorHook('onError', { error: 'test' });
      expect(result).toBeNull();
    });

    test('executes error hook and returns result', async () => {
      const errorHook = vi.fn().mockResolvedValue({ handled: true, redirect: '/error' });
      const executor = new HookExecutor({ hooks: { onError: errorHook } });

      const result = await executor.executeErrorHook('onError', { error: 'test' });

      expect(result).toEqual({ handled: true, redirect: '/error' });
    });

    test('returns first non-null result from multiple error hooks', async () => {
      const hook1 = vi.fn().mockResolvedValue(null);
      const hook2 = vi.fn().mockResolvedValue({ handled: true });

      const executor = new HookExecutor({ hooks: { onError: [hook1, hook2] } });
      const result = await executor.executeErrorHook('onError', { error: 'test' });

      expect(result).toEqual({ handled: true });
    });
  });

  describe('metrics', () => {
    test('tracks hook executions', async () => {
      const hook = vi.fn().mockResolvedValue({});
      const executor = new HookExecutor({ hooks: { beforeLogin: hook } });

      await executor.executeHooks('beforeLogin', {});
      await executor.executeHooks('beforeLogin', {});

      const metrics = executor.getMetrics();
      expect(metrics.executions['beforeLogin[1]']).toBe(2);
    });

    test('tracks hook errors', async () => {
      const hook = vi.fn().mockRejectedValue(new Error('failed'));
      const executor = new HookExecutor({ hooks: { beforeLogin: hook } });

      await executor.executeHooks('beforeLogin', {});

      const metrics = executor.getMetrics();
      expect(metrics.errors['beforeLogin[1]']).toBe(1);
    });

    test('resets metrics', async () => {
      const hook = vi.fn().mockResolvedValue({});
      const executor = new HookExecutor({ hooks: { beforeLogin: hook } });

      await executor.executeHooks('beforeLogin', {});
      executor.resetMetrics();

      const metrics = executor.getMetrics();
      expect(metrics.executions).toEqual({});
    });
  });
});

describe('createHookExecutor', () => {
  test('creates HookExecutor instance', () => {
    const executor = createHookExecutor({});
    expect(executor).toBeInstanceOf(HookExecutor);
  });

  test('passes config to executor', () => {
    const hook = vi.fn();
    const executor = createHookExecutor({ hooks: { beforeLogin: hook } });
    expect(executor.getHooks('beforeLogin')).toEqual([hook]);
  });
});
