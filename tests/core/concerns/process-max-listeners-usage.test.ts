import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/concerns/process-max-listeners.js', () => ({
  bumpProcessMaxListeners: vi.fn()
}));

import { bumpProcessMaxListeners } from '../../../src/concerns/process-max-listeners.js';
import { SafeEventEmitter } from '../../../src/concerns/safe-event-emitter.js';
import { CronManager } from '../../../src/concerns/cron-manager.js';
import { ProcessManager } from '../../../src/concerns/process-manager.js';
import { DatabaseConnection } from '../../../src/database/database-connection.class.js';
import { ProcessManager as ReconProcessManager } from '../../../src/plugins/recon/concerns/process-manager.js';

describe('process max listeners usage', () => {
  const bump = vi.mocked(bumpProcessMaxListeners);
  let onSpy: ReturnType<typeof vi.spyOn>;
  let onceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    bump.mockClear();
    onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    onceSpy = vi.spyOn(process, 'once').mockImplementation(() => process);
  });

  afterEach(() => {
    onSpy.mockRestore();
    onceSpy.mockRestore();
  });

  it('bumps for SafeEventEmitter signal handlers', () => {
    const emitter = new SafeEventEmitter({ autoCleanup: true, logLevel: 'silent' });

    expect(bump).toHaveBeenCalledWith(3);

    emitter.removeSignalHandlers();
  });

  it('bumps for CronManager signal handlers', () => {
    const manager = new CronManager({ disabled: false, logLevel: 'silent', exitOnSignal: false });

    expect(bump).toHaveBeenCalledWith(5);

    manager.removeSignalHandlers();
  });

  it('bumps for ProcessManager signal handlers', () => {
    const manager = new ProcessManager({ logLevel: 'silent', exitOnSignal: false });

    expect(bump).toHaveBeenCalledWith(4);

    manager.removeSignalHandlers();
  });

  it('bumps for DatabaseConnection exit listener', () => {
    const connection = new DatabaseConnection(
      { isConnected: () => false } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    connection.registerExitListener();

    expect(bump).toHaveBeenCalledWith(1);
  });

  it('bumps for recon ProcessManager cleanup handlers', () => {
    new ReconProcessManager();

    expect(bump).toHaveBeenCalledWith(6);
  });
});
