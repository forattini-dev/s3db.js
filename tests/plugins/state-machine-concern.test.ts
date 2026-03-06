import {
  AttemptStateMachine,
  NotificationStateMachine,
  createAttemptStateMachine,
  createNotificationStateMachine
} from '../../src/plugins/api/concerns/state-machine.js';

describe('API state machine concerns', () => {
  it('should expose notification and attempt state machine factories', () => {
    const notification = createNotificationStateMachine();
    const attempt = createAttemptStateMachine();

    expect(notification).toBeInstanceOf(NotificationStateMachine);
    expect(attempt).toBeInstanceOf(AttemptStateMachine);
  });

  it('should validate transitions using base state machine', () => {
    const notification = createNotificationStateMachine();

    expect(notification.canTransition('pending', 'START_PROCESSING')).toEqual({
      valid: true,
      newState: 'processing'
    });

    expect(notification.canTransition('pending', 'COMPLETE').valid).toBe(false);
  });

  it('should patch record during notification transition', async () => {
    const notification = createNotificationStateMachine();
    const record = { id: 'notify-1', status: 'pending' };
    const patch = vi.fn().mockResolvedValue({ id: 'notify-1', status: 'processing' });
    const resource = { patch, insert: vi.fn() };

    const result = await notification.transition(record, 'START_PROCESSING', resource, { source: 'scheduler' });

    expect(patch).toHaveBeenCalledWith('notify-1', {
      status: 'processing',
      source: 'scheduler',
      lastTransitionAt: expect.any(String),
      lastTransition: 'START_PROCESSING'
    });
    expect(result).toEqual({ id: 'notify-1', status: 'processing' });
  });

  it('should return valid transitions for current state', () => {
    const attempt = createAttemptStateMachine();

    expect(attempt.getValidTransitions('queued')).toEqual(['START']);
    expect(attempt.getValidTransitions('running')).toEqual(expect.arrayContaining(['SUCCEED', 'FAIL', 'TIMEOUT']));
    expect(attempt.isTerminalState('success')).toBe(true);
  });

  it('should insert merged record during attempt transition', async () => {
    const attempt = createAttemptStateMachine();
    const record = { id: 'attempt-1', status: 'queued', createdAt: '2026-01-01T00:00:00.000Z' };
    const insert = vi.fn().mockResolvedValue({
      id: 'attempt-1',
      status: 'running',
      createdAt: '2026-01-01T00:00:00.000Z',
      source: 'worker'
    });
    const resource = { insert, patch: vi.fn() };

    const result = await attempt.transition(record, 'START', resource, { source: 'worker' });

    expect(insert).toHaveBeenCalledWith({
      ...record,
      status: 'running',
      source: 'worker',
      lastTransitionAt: expect.any(String),
      lastTransition: 'START'
    });
    expect(resource.patch).not.toHaveBeenCalled();
    expect(result.status).toBe('running');
    expect(result.source).toBe('worker');
  });
});
