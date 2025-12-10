import { describe, test, expect, vi } from 'vitest';
import { createQueryValidation } from '../../../src/plugins/api/middlewares/validator.js';

function createMockContext(query: Record<string, string> = {}) {
  return {
    req: {
      query: () => query
    },
    json: vi.fn((body, status) => ({ body, status }))
  };
}

describe('createQueryValidation', () => {
  describe('required params', () => {
    test('passes when required param is present', async () => {
      const validate = createQueryValidation({
        id: { required: true }
      });
      const ctx = createMockContext({ id: '123' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).toHaveBeenCalled();
      expect(ctx.json).not.toHaveBeenCalled();
    });

    test('fails when required param is missing', async () => {
      const validate = createQueryValidation({
        id: { required: true }
      });
      const ctx = createMockContext({});
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.json).toHaveBeenCalled();
      const response = ctx.json.mock.calls[0][0];
      expect(response.error.details.errors[0].message).toContain("'id' is required");
    });

    test('fails for multiple missing required params', async () => {
      const validate = createQueryValidation({
        id: { required: true },
        name: { required: true }
      });
      const ctx = createMockContext({});
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).not.toHaveBeenCalled();
      const response = ctx.json.mock.calls[0][0];
      expect(response.error.details.errors).toHaveLength(2);
    });
  });

  describe('type validation', () => {
    test('number type - valid', async () => {
      const validate = createQueryValidation({
        limit: { type: 'number' }
      });
      const ctx = createMockContext({ limit: '100' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).toHaveBeenCalled();
    });

    test('number type - invalid (non-numeric)', async () => {
      const validate = createQueryValidation({
        limit: { type: 'number' }
      });
      const ctx = createMockContext({ limit: 'abc' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).not.toHaveBeenCalled();
      const response = ctx.json.mock.calls[0][0];
      expect(response.error.details.errors[0].message).toContain("must be a number");
    });

    test('boolean type - valid (true)', async () => {
      const validate = createQueryValidation({
        active: { type: 'boolean' }
      });
      const ctx = createMockContext({ active: 'true' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).toHaveBeenCalled();
    });

    test('boolean type - valid (false)', async () => {
      const validate = createQueryValidation({
        active: { type: 'boolean' }
      });
      const ctx = createMockContext({ active: 'false' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).toHaveBeenCalled();
    });

    test('boolean type - valid (1/0)', async () => {
      const validate = createQueryValidation({
        active: { type: 'boolean' }
      });

      const ctx1 = createMockContext({ active: '1' });
      const next1 = vi.fn();
      await validate(ctx1 as any, next1);
      expect(next1).toHaveBeenCalled();

      const ctx2 = createMockContext({ active: '0' });
      const next2 = vi.fn();
      await validate(ctx2 as any, next2);
      expect(next2).toHaveBeenCalled();
    });

    test('boolean type - invalid', async () => {
      const validate = createQueryValidation({
        active: { type: 'boolean' }
      });
      const ctx = createMockContext({ active: 'yes' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).not.toHaveBeenCalled();
      const response = ctx.json.mock.calls[0][0];
      expect(response.error.details.errors[0].message).toContain("must be a boolean");
    });
  });

  describe('min/max validation', () => {
    test('number within range', async () => {
      const validate = createQueryValidation({
        limit: { type: 'number', min: 1, max: 100 }
      });
      const ctx = createMockContext({ limit: '50' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).toHaveBeenCalled();
    });

    test('number below min', async () => {
      const validate = createQueryValidation({
        limit: { type: 'number', min: 1 }
      });
      const ctx = createMockContext({ limit: '0' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).not.toHaveBeenCalled();
      const response = ctx.json.mock.calls[0][0];
      expect(response.error.details.errors[0].message).toContain("at least 1");
    });

    test('number above max', async () => {
      const validate = createQueryValidation({
        limit: { type: 'number', max: 100 }
      });
      const ctx = createMockContext({ limit: '150' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).not.toHaveBeenCalled();
      const response = ctx.json.mock.calls[0][0];
      expect(response.error.details.errors[0].message).toContain("at most 100");
    });

    test('negative numbers work with min', async () => {
      const validate = createQueryValidation({
        offset: { type: 'number', min: 0 }
      });
      const ctx = createMockContext({ offset: '-5' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('enum validation', () => {
    test('value in enum - passes', async () => {
      const validate = createQueryValidation({
        status: { enum: ['active', 'inactive', 'pending'] }
      });
      const ctx = createMockContext({ status: 'active' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).toHaveBeenCalled();
    });

    test('value not in enum - fails', async () => {
      const validate = createQueryValidation({
        status: { enum: ['active', 'inactive'] }
      });
      const ctx = createMockContext({ status: 'deleted' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).not.toHaveBeenCalled();
      const response = ctx.json.mock.calls[0][0];
      expect(response.error.details.errors[0].message).toContain("must be one of");
      expect(response.error.details.errors[0].message).toContain("active");
      expect(response.error.details.errors[0].message).toContain("inactive");
    });
  });

  describe('optional params', () => {
    test('optional param missing - passes', async () => {
      const validate = createQueryValidation({
        limit: { type: 'number', min: 1 }
      });
      const ctx = createMockContext({});
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).toHaveBeenCalled();
    });

    test('optional param present but invalid - fails', async () => {
      const validate = createQueryValidation({
        limit: { type: 'number' }
      });
      const ctx = createMockContext({ limit: 'not-a-number' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('multiple validations', () => {
    test('all params valid', async () => {
      const validate = createQueryValidation({
        limit: { type: 'number', min: 1, max: 100 },
        offset: { type: 'number', min: 0 },
        status: { enum: ['active', 'inactive'] }
      });
      const ctx = createMockContext({
        limit: '50',
        offset: '10',
        status: 'active'
      });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).toHaveBeenCalled();
    });

    test('multiple invalid params - reports all errors', async () => {
      const validate = createQueryValidation({
        limit: { type: 'number', min: 1 },
        status: { enum: ['active', 'inactive'] }
      });
      const ctx = createMockContext({
        limit: '-5',
        status: 'deleted'
      });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).not.toHaveBeenCalled();
      const response = ctx.json.mock.calls[0][0];
      expect(response.error.details.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('empty schema', () => {
    test('passes with no schema rules', async () => {
      const validate = createQueryValidation({});
      const ctx = createMockContext({ anything: 'goes' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).toHaveBeenCalled();
    });

    test('passes with default empty schema', async () => {
      const validate = createQueryValidation();
      const ctx = createMockContext({ foo: 'bar' });
      const next = vi.fn();

      await validate(ctx as any, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
