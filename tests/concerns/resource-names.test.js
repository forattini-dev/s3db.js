import { describe, expect, it } from '@jest/globals';
import {
  resolveResourceName,
  resolveResourceNames
} from '../../src/plugins/concerns/resource-names.js';

describe('resource-names namespace support', () => {
  it('keeps default behaviour without namespace', () => {
    const name = resolveResourceName('identity', {
      defaultName: 'plg_identity_sessions'
    });
    expect(name).toBe('plg_identity_sessions');
  });

  it('applies namespace to default names (namespace comes first)', () => {
    const name = resolveResourceName('identity', {
      defaultName: 'plg_identity_sessions'
    }, { namespace: 'tenant-alpha' });

    // Pattern: plg_<namespace>_<plugin>_<resource>
    expect(name).toBe('plg_tenant-alpha_identity_sessions');
  });

  it('does not namespace overrides by default', () => {
    const name = resolveResourceName('identity', {
      override: 'custom_sessions'
    }, { namespace: 'tenant-alpha' });

    expect(name).toBe('custom_sessions');
  });

  it('optionally namespaces overrides when requested', () => {
    const name = resolveResourceName('identity', {
      override: 'custom_sessions'
    }, { namespace: 'tenant-alpha', applyNamespaceToOverrides: true });

    // Pattern: plg_<namespace>_<custom_name>
    expect(name).toBe('plg_tenant-alpha_custom_sessions');
  });

  it('namespaces every descriptor via resolveResourceNames', () => {
    const names = resolveResourceNames('identity', {
      sessions: { defaultName: 'plg_identity_sessions' },
      tokens: { defaultName: 'plg_identity_tokens' }
    }, { namespace: 'Tenant-Alpha' });

    // Pattern: plg_<namespace>_<plugin>_<resource>
    // Note: namespace is normalized to lowercase with hyphens
    expect(names.sessions).toBe('plg_tenant-alpha_identity_sessions');
    expect(names.tokens).toBe('plg_tenant-alpha_identity_tokens');
  });
});
