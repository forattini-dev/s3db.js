import { describe, it, expect, vi, afterEach } from 'vitest';
import { bumpProcessMaxListeners } from '../../../src/concerns/process-max-listeners.js';

describe('bumpProcessMaxListeners', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('increments the process max listeners when above zero', () => {
    vi.spyOn(process, 'getMaxListeners').mockReturnValue(10);
    const setSpy = vi.spyOn(process, 'setMaxListeners').mockImplementation(() => process);

    bumpProcessMaxListeners(3);

    expect(setSpy).toHaveBeenCalledWith(13);
  });

  it('does nothing when additionalListeners is zero or negative', () => {
    const setSpy = vi.spyOn(process, 'setMaxListeners').mockImplementation(() => process);

    bumpProcessMaxListeners(0);
    bumpProcessMaxListeners(-2);

    expect(setSpy).not.toHaveBeenCalled();
  });

  it('does nothing when process max listeners is unlimited', () => {
    vi.spyOn(process, 'getMaxListeners').mockReturnValue(0);
    const setSpy = vi.spyOn(process, 'setMaxListeners').mockImplementation(() => process);

    bumpProcessMaxListeners(4);

    expect(setSpy).not.toHaveBeenCalled();
  });
});
