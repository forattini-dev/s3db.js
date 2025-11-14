/**
 * SMTP Plugin - Driver/Config Pattern Tests
 * Tests for new driver pattern and multi-relay functionality
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';
import { SMTPPlugin } from '../../src/plugins/smtp.plugin.js';
import { createDriver, getAvailableDrivers, MultiRelayManager } from '../../src/plugins/smtp/drivers/index.js';

describe('SMTP Plugin - Driver Pattern', () => {
  let db;

  beforeEach(async () => {
    db = new Database({
      client: new MemoryClient({ bucket: 'test' })
    });
    await db.connect();
  });

  afterEach(async () => {
    if (db) await db.disconnect();
  });

  describe('Driver Factory', () => {
    it('should list available drivers', () => {
      const drivers = getAvailableDrivers();
      expect(drivers).toBeInstanceOf(Array);
      expect(drivers).toContain('smtp');
      expect(drivers).toContain('sendgrid');
      expect(drivers).toContain('aws-ses');
      expect(drivers).toContain('mailgun');
      expect(drivers).toContain('postmark');
    });

    it('should throw error for unknown driver', async () => {
      await expect(
        createDriver('unknown-driver', {})
      ).rejects.toThrow('Unknown SMTP driver');
    });
  });

  describe('SMTP Plugin - Driver Mode', () => {
    it('should initialize with driver/config pattern', async () => {
      const plugin = new SMTPPlugin({
        mode: 'relay',
        driver: 'smtp',
        config: {
          host: 'localhost',
          port: 1025,
          secure: false,
          auth: {
            user: 'test',
            pass: 'test'
          }
        },
        from: 'test@example.com'
      });

      expect(plugin.useDriverPattern).toBe(true);
      expect(plugin.driver).toBe('smtp');
      expect(plugin.config.host).toBe('localhost');
    });

    it('should detect legacy mode for host/port/auth', async () => {
      const plugin = new SMTPPlugin({
        mode: 'relay',
        host: 'localhost',
        port: 1025,
        auth: {
          user: 'test',
          pass: 'test'
        }
      });

      expect(plugin.useDriverPattern).toBe(false);
      expect(plugin.host).toBe('localhost');
    });

    it('should have relayDriver property after driver initialization', async () => {
      const plugin = new SMTPPlugin({
        mode: 'relay',
        driver: 'smtp',
        config: {
          host: 'localhost',
          port: 1025,
          secure: false,
          auth: {
            user: 'test',
            pass: 'test'
          }
        },
        from: 'test@example.com'
      });

      // Mock the relayDriver
      plugin.relayDriver = {
        name: 'smtp',
        getInfo: () => ({ name: 'smtp' })
      };

      const status = plugin.getStatus();

      expect(status.configType).toBe('driver');
      expect(status.driver).toBe('smtp');
      expect(status).toHaveProperty('driverInfo');
    });
  });

  describe('Multi-Relay Manager', () => {
    it('should initialize multi-relay manager with relays map', async () => {
      const manager = new MultiRelayManager({
        strategy: 'failover'
      });

      // Create mocked relays
      const mockDriver1 = {
        initialize: async () => {},
        close: async () => {},
        getInfo: () => ({ name: 'relay1' })
      };

      const mockDriver2 = {
        initialize: async () => {},
        close: async () => {},
        getInfo: () => ({ name: 'relay2' })
      };

      manager.relays.set('relay1', {
        driver: mockDriver1,
        config: { name: 'relay1', driver: 'smtp', config: {} },
        failures: 0,
        lastError: null,
        isHealthy: true
      });

      manager.relays.set('relay2', {
        driver: mockDriver2,
        config: { name: 'relay2', driver: 'smtp', config: {} },
        failures: 0,
        lastError: null,
        isHealthy: true
      });

      manager._initialized = true;

      expect(manager.relays.size).toBe(2);
    });

    it('should track relay health status', async () => {
      const manager = new MultiRelayManager({
        strategy: 'failover'
      });

      const mockDriver = {
        initialize: async () => {},
        close: async () => {},
        getInfo: () => ({ name: 'relay1' })
      };

      manager.relays.set('relay1', {
        driver: mockDriver,
        config: { name: 'relay1', driver: 'smtp', config: {} },
        failures: 0,
        lastError: null,
        isHealthy: true
      });

      manager._initialized = true;
      const status = manager.getStatus();

      expect(status).toHaveProperty('relay1');
      expect(status.relay1).toHaveProperty('healthy');
      expect(status.relay1).toHaveProperty('failures');
    });

    it('should reset relay failures', async () => {
      const manager = new MultiRelayManager({
        strategy: 'failover'
      });

      const mockDriver = {
        initialize: async () => {},
        close: async () => {},
        getInfo: () => ({ name: 'relay1' })
      };

      manager.relays.set('relay1', {
        driver: mockDriver,
        config: { name: 'relay1', driver: 'smtp', config: {} },
        failures: 0,
        lastError: null,
        isHealthy: true
      });

      manager._initialized = true;

      // Simulate failures
      const relay = manager.relays.get('relay1');
      relay.failures = 5;
      relay.isHealthy = false;

      // Reset
      manager.resetRelay('relay1');
      const status = manager.getStatus();

      expect(status.relay1.failures).toBe(0);
      expect(status.relay1.healthy).toBe(true);
    });
  });

  describe('SMTP Plugin - Multi-Relay Mode', () => {
    it('should initialize with multi-relay configuration', async () => {
      const plugin = new SMTPPlugin({
        mode: 'relay',
        relays: [
          {
            name: 'primary',
            driver: 'smtp',
            config: {
              host: 'primary.example.com',
              port: 587,
              secure: false,
              auth: { user: 'user1', pass: 'pass1' }
            }
          },
          {
            name: 'backup',
            driver: 'smtp',
            config: {
              host: 'backup.example.com',
              port: 587,
              secure: false,
              auth: { user: 'user2', pass: 'pass2' }
            }
          }
        ],
        relayStrategy: 'failover',
        from: 'test@example.com'
      });

      expect(plugin.relays).toHaveLength(2);
      expect(plugin.relayStrategy).toBe('failover');
    });

    it('should have multi-relay configuration properties', async () => {
      const plugin = new SMTPPlugin({
        mode: 'relay',
        relays: [
          {
            name: 'primary',
            driver: 'smtp',
            config: {
              host: 'primary.example.com',
              port: 587,
              secure: false,
              auth: { user: 'user1', pass: 'pass1' }
            }
          }
        ],
        relayStrategy: 'failover',
        from: 'test@example.com'
      });

      expect(plugin.relays).toHaveLength(1);
      expect(plugin.relayStrategy).toBe('failover');
      expect(plugin.from).toBe('test@example.com');
    });
  });

  describe('Available Drivers', () => {
    it('should have static method to get available drivers', () => {
      const drivers = SMTPPlugin.getAvailableDrivers();
      expect(drivers).toBeInstanceOf(Array);
      expect(drivers.length).toBeGreaterThan(0);
      expect(drivers).toContain('smtp');
    });
  });
});
