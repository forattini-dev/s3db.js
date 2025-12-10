import {
  listPluginNamespaces,
  warnNamespaceUsage,
  detectAndWarnNamespaces,
  getNamespacedResourceName,
  validateNamespace,
  getValidatedNamespace
} from '../../src/plugins/namespace.js';

describe('Plugin Namespace Support', () => {
  describe('validateNamespace()', () => {
    it('should allow empty string (no namespace)', () => {
      expect(() => validateNamespace('')).not.toThrow();
    });

    it('should allow valid namespaces', () => {
      expect(() => validateNamespace('uptime')).not.toThrow();
      expect(() => validateNamespace('client-acme')).not.toThrow();
      expect(() => validateNamespace('prod_env_2')).not.toThrow();
      expect(() => validateNamespace('a')).not.toThrow();
    });

    it('should reject invalid namespaces', () => {
      expect(() => validateNamespace('invalid space')).toThrow(/alphanumeric/);
      expect(() => validateNamespace('client@acme')).toThrow(/alphanumeric/);
      expect(() => validateNamespace('prod.env')).toThrow(/alphanumeric/);
    });

    it('should reject namespaces over 50 characters', () => {
      expect(() => validateNamespace('a'.repeat(51))).toThrow(/50 characters/);
    });

    it('should reject null/undefined', () => {
      expect(() => validateNamespace(null)).toThrow(/must be a string/);
      expect(() => validateNamespace(undefined)).toThrow(/must be a string/);
    });

    it('should reject non-strings', () => {
      expect(() => validateNamespace(123)).toThrow(/must be a string/);
      expect(() => validateNamespace({})).toThrow(/must be a string/);
    });
  });

  describe('getValidatedNamespace()', () => {
    it('should return empty string by default', () => {
      expect(getValidatedNamespace({})).toBe('');
      expect(getValidatedNamespace()).toBe('');
    });

    it('should extract namespace from config', () => {
      expect(getValidatedNamespace({ namespace: 'uptime' })).toBe('uptime');
      expect(getValidatedNamespace({ namespace: 'prod' })).toBe('prod');
    });

    it('should allow explicit empty string', () => {
      expect(getValidatedNamespace({ namespace: '' })).toBe('');
    });

    it('should use custom default', () => {
      expect(getValidatedNamespace({}, 'custom')).toBe('custom');
    });

    it('should validate namespace', () => {
      expect(() => getValidatedNamespace({ namespace: 'invalid space' })).toThrow();
    });
  });

  describe('getNamespacedResourceName()', () => {
    it('should return base name when no namespace', () => {
      expect(getNamespacedResourceName('plg_recon_hosts', '', 'plg_recon'))
        .toBe('plg_recon_hosts');

      expect(getNamespacedResourceName('plg_scheduler_jobs', '', 'plg_scheduler'))
        .toBe('plg_scheduler_jobs');
    });

    it('should insert namespace after plg_ prefix', () => {
      // Pattern: plg_<namespace>_<plugin>_<resource>
      expect(getNamespacedResourceName('plg_recon_hosts', 'uptime', 'plg_recon'))
        .toBe('plg_uptime_recon_hosts');

      expect(getNamespacedResourceName('plg_recon_reports', 'uptime', 'plg_recon'))
        .toBe('plg_uptime_recon_reports');

      expect(getNamespacedResourceName('plg_scheduler_jobs', 'prod', 'plg_scheduler'))
        .toBe('plg_prod_scheduler_jobs');

      expect(getNamespacedResourceName('plg_cache_entries', 'staging', 'plg_cache'))
        .toBe('plg_staging_cache_entries');
    });

    it('should work with complex resource names', () => {
      expect(getNamespacedResourceName('plg_identity_sessions', 'tenant-a', 'plg_identity'))
        .toBe('plg_tenant-a_identity_sessions');

      expect(getNamespacedResourceName('plg_eventual_consistency_counters', 'prod', 'plg_eventual_consistency'))
        .toBe('plg_prod_eventual_consistency_counters');
    });

    it('should handle hyphens and underscores in namespace', () => {
      expect(getNamespacedResourceName('plg_recon_hosts', 'client-acme', 'plg_recon'))
        .toBe('plg_client-acme_recon_hosts');

      expect(getNamespacedResourceName('plg_recon_hosts', 'env_prod_2', 'plg_recon'))
        .toBe('plg_env_prod_2_recon_hosts');
    });
  });

  describe('warnNamespaceUsage()', () => {
    let consoleWarnSpy;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('should warn about current namespace only when no existing', () => {
      warnNamespaceUsage('TestPlugin', 'uptime', []);

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith('[TestPlugin] Using namespace: "uptime"');
    });

    it('should warn about existing namespaces', () => {
      warnNamespaceUsage('TestPlugin', 'staging', ['prod', 'uptime']);

      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[TestPlugin] Detected 2 existing namespace(s): prod, uptime'
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith('[TestPlugin] Using namespace: "staging"');
    });

    it('should display (none) for empty namespace', () => {
      warnNamespaceUsage('TestPlugin', '', []);

      expect(consoleWarnSpy).toHaveBeenCalledWith('[TestPlugin] Using namespace: (none)');
    });
  });

  describe('Resource Name Patterns', () => {
    it('should create alphabetically grouped names', () => {
      // No namespace
      const noNs = getNamespacedResourceName('plg_recon_hosts', '', 'plg_recon');

      // Prod namespace
      const prodNs = getNamespacedResourceName('plg_recon_hosts', 'prod', 'plg_recon');

      // Staging namespace
      const stagingNs = getNamespacedResourceName('plg_recon_hosts', 'staging', 'plg_recon');

      // When sorted alphabetically, namespaced resources group together
      const sorted = [noNs, prodNs, stagingNs].sort();

      expect(sorted).toEqual([
        'plg_prod_recon_hosts',      // prod group
        'plg_recon_hosts',            // no namespace
        'plg_staging_recon_hosts'     // staging group
      ]);
    });

    it('should group all resources of same namespace', () => {
      const prodCache = getNamespacedResourceName('plg_cache_entries', 'prod', 'plg_cache');
      const prodRecon = getNamespacedResourceName('plg_recon_hosts', 'prod', 'plg_recon');
      const prodScheduler = getNamespacedResourceName('plg_scheduler_jobs', 'prod', 'plg_scheduler');

      const sorted = [prodCache, prodRecon, prodScheduler].sort();

      // All prod resources grouped together
      expect(sorted).toEqual([
        'plg_prod_cache_entries',
        'plg_prod_recon_hosts',
        'plg_prod_scheduler_jobs'
      ]);

      // All start with 'plg_prod_'
      sorted.forEach(name => {
        expect(name).toMatch(/^plg_prod_/);
      });
    });
  });

  describe('Real-world Scenarios', () => {
    it('should support multi-tenant SaaS', () => {
      const clientA = getNamespacedResourceName('plg_metrics_counters', 'client-acme', 'plg_metrics');
      const clientB = getNamespacedResourceName('plg_metrics_counters', 'client-globex', 'plg_metrics');
      const global = getNamespacedResourceName('plg_metrics_counters', '', 'plg_metrics');

      expect(clientA).toBe('plg_client-acme_metrics_counters');
      expect(clientB).toBe('plg_client-globex_metrics_counters');
      expect(global).toBe('plg_metrics_counters');
    });

    it('should support multi-environment monitoring', () => {
      const prod = getNamespacedResourceName('plg_recon_hosts', 'prod', 'plg_recon');
      const staging = getNamespacedResourceName('plg_recon_hosts', 'staging', 'plg_recon');
      const dev = getNamespacedResourceName('plg_recon_hosts', 'dev', 'plg_recon');

      expect(prod).toBe('plg_prod_recon_hosts');
      expect(staging).toBe('plg_staging_recon_hosts');
      expect(dev).toBe('plg_dev_recon_hosts');
    });

    it('should support different behavior modes', () => {
      const uptime = getNamespacedResourceName('plg_recon_hosts', 'uptime', 'plg_recon');
      const stealth = getNamespacedResourceName('plg_recon_hosts', 'stealth', 'plg_recon');
      const aggressive = getNamespacedResourceName('plg_recon_hosts', 'aggressive', 'plg_recon');

      expect(uptime).toBe('plg_uptime_recon_hosts');
      expect(stealth).toBe('plg_stealth_recon_hosts');
      expect(aggressive).toBe('plg_aggressive_recon_hosts');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain clean names for global context (no namespace)', () => {
      // When no namespace is used, resource names stay clean
      expect(getNamespacedResourceName('plg_recon_hosts', '', 'plg_recon'))
        .toBe('plg_recon_hosts');

      expect(getNamespacedResourceName('plg_cache_entries', '', 'plg_cache'))
        .toBe('plg_cache_entries');

      // No namespace pollution in global context
      const globalName = getNamespacedResourceName('plg_scheduler_jobs', '', 'plg_scheduler');
      expect(globalName).not.toContain('default');
      expect(globalName).not.toContain('global');
    });
  });

  describe('Edge Cases', () => {
    it('should handle resources with multiple underscores', () => {
      expect(getNamespacedResourceName('plg_state_machine_workflows', 'prod', 'plg_state_machine'))
        .toBe('plg_prod_state_machine_workflows');
    });

    it('should handle single-character namespace', () => {
      expect(getNamespacedResourceName('plg_recon_hosts', 'a', 'plg_recon'))
        .toBe('plg_a_recon_hosts');
    });

    it('should handle max length namespace (50 chars)', () => {
      const longNs = 'a'.repeat(50);
      expect(getNamespacedResourceName('plg_recon_hosts', longNs, 'plg_recon'))
        .toBe(`plg_${longNs}_recon_hosts`);
    });

    it('should handle namespace with mixed case (normalized elsewhere)', () => {
      // Assuming normalization happens elsewhere
      expect(getNamespacedResourceName('plg_recon_hosts', 'prod-env', 'plg_recon'))
        .toBe('plg_prod-env_recon_hosts');
    });
  });
});
