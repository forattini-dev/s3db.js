import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { SMTPPlugin } from '../../src/plugins/smtp.plugin.js';
import {
  SMTPError,
  AuthenticationError,
  TemplateError,
  RecipientError,
  ConnectionError,
  RateLimitError,
  AttachmentError
} from '../../src/plugins/smtp/errors.js';
import { Database } from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';

describe('SMTPPlugin', () => {
  let db;
  let plugin;

  beforeEach(async () => {
    // Create in-memory database
    db = new Database({
      client: new MemoryClient({ bucket: 'test' })
    });

    // Create SMTP plugin with relay mode
    plugin = new SMTPPlugin({
      mode: 'relay',
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: {
        user: 'test@example.com',
        pass: 'password123'
      },
      emailResource: 'test_emails',
      logLevel: 'silent'
    });

    // Set database reference
    plugin.database = db;

    // Mock connection manager to avoid actual SMTP connections in tests
    plugin.connectionManager = {
      _isConnected: true,
      initialize: async () => {},
      verify: async () => true,
      close: async () => {},
      sendEmail: async (message) => ({
        messageId: `<test-${Date.now()}@example.com>`,
        response: '250 OK',
        accepted: message.to ? message.to.split(',') : [],
        rejected: []
      })
    };
  });

  afterEach(async () => {
    if (plugin && plugin.connectionManager) {
      await plugin.connectionManager.close();
    }
  });

  describe('Initialization', () => {
    it('should initialize plugin with relay mode', () => {
      expect(plugin.mode).toBe('relay');
      expect(plugin.host).toBe('smtp.example.com');
      expect(plugin.emailResource).toBe('test_emails');
    });

    it('should have default retry policy', () => {
      expect(plugin.retryPolicy.maxAttempts).toBe(5);
      expect(plugin.retryPolicy.multiplier).toBe(2);
    });

    it('should have default rate limit', () => {
      expect(plugin.rateLimit.maxPerSecond).toBe(100);
      expect(plugin.rateLimit.maxQueueDepth).toBe(10000);
    });
  });

  describe('Error Classes', () => {
    it('should create SMTPError with retriable flag', () => {
      const err = new SMTPError('Test error');
      expect(err.name).toBe('SMTPError');
      expect(err.retriable).toBe(true);
    });

    it('should create AuthenticationError as non-retriable', () => {
      const err = new AuthenticationError('Auth failed');
      expect(err.name).toBe('AuthenticationError');
      expect(err.retriable).toBe(false);
    });

    it('should create TemplateError as non-retriable', () => {
      const err = new TemplateError('Template syntax error');
      expect(err.name).toBe('TemplateError');
      expect(err.retriable).toBe(false);
    });

    it('should create RecipientError as non-retriable', () => {
      const err = new RecipientError('Invalid email');
      expect(err.name).toBe('RecipientError');
      expect(err.retriable).toBe(false);
    });

    it('should create RateLimitError as retriable', () => {
      const err = new RateLimitError('Rate limited');
      expect(err.name).toBe('RateLimitError');
      expect(err.retriable).toBe(true);
    });

    it('should create ConnectionError as retriable', () => {
      const err = new ConnectionError('Connection timeout');
      expect(err.name).toBe('ConnectionError');
      expect(err.retriable).toBe(true);
    });
  });

  describe('Email Validation', () => {
    it('should reject email without from address', () => {
      expect(() => {
        plugin._validateEmailOptions({
          to: 'recipient@example.com',
          subject: 'Test',
          body: 'Test body'
        });
      }).toThrow(RecipientError);
    });

    it('should reject email without recipient', () => {
      expect(() => {
        plugin._validateEmailOptions({
          from: 'sender@example.com',
          subject: 'Test',
          body: 'Test body'
        });
      }).toThrow(RecipientError);
    });

    it('should reject email without subject', () => {
      expect(() => {
        plugin._validateEmailOptions({
          from: 'sender@example.com',
          to: 'recipient@example.com',
          body: 'Test body'
        });
      }).toThrow(SMTPError);
    });

    it('should reject email without body/html/template', () => {
      expect(() => {
        plugin._validateEmailOptions({
          from: 'sender@example.com',
          to: 'recipient@example.com',
          subject: 'Test'
        });
      }).toThrow(SMTPError);
    });

    it('should reject invalid email format', () => {
      expect(() => {
        plugin._validateEmailOptions({
          from: 'invalid-email',
          to: 'recipient@example.com',
          subject: 'Test',
          body: 'Test'
        });
      }).toThrow(RecipientError);
    });

    it('should accept valid email options', () => {
      expect(() => {
        plugin._validateEmailOptions({
          from: 'sender@example.com',
          to: 'recipient@example.com',
          subject: 'Test',
          body: 'Test body'
        });
      }).not.toThrow();
    });

    it('should accept multiple recipients', () => {
      expect(() => {
        plugin._validateEmailOptions({
          from: 'sender@example.com',
          to: ['recipient1@example.com', 'recipient2@example.com'],
          subject: 'Test',
          body: 'Test body'
        });
      }).not.toThrow();
    });
  });

  describe('Attachment Validation', () => {
    it('should reject attachments that are not arrays', () => {
      expect(() => {
        plugin._validateAttachments({ filename: 'test.txt' });
      }).toThrow(AttachmentError);
    });

    it('should reject attachment without filename', () => {
      expect(() => {
        plugin._validateAttachments([
          { content: Buffer.from('test') }
        ]);
      }).toThrow(AttachmentError);
    });

    it('should reject attachment exceeding size limit', () => {
      const largeContent = Buffer.alloc(30 * 1024 * 1024); // 30MB (exceeds 25MB default)
      expect(() => {
        plugin._validateAttachments([
          { filename: 'large.bin', content: largeContent }
        ]);
      }).toThrow(AttachmentError);
    });

    it('should accept valid attachments', () => {
      expect(() => {
        plugin._validateAttachments([
          { filename: 'document.pdf', content: Buffer.from('PDF content') }
        ]);
      }).not.toThrow();
    });
  });

  describe('Rate Limiting', () => {
    it('should track rate limit tokens', async () => {
      plugin._rateLimitTokens = 5;
      plugin._lastRateLimitRefill = Date.now();

      // First call should succeed
      expect(plugin._rateLimitTokens).toBe(5);
      await plugin._checkRateLimit();
      expect(plugin._rateLimitTokens).toBe(4);
    });

    it('should throw RateLimitError when no tokens available', async () => {
      plugin._rateLimitTokens = 0;
      plugin._lastRateLimitRefill = Date.now();

      await expect(plugin._checkRateLimit()).rejects.toThrow(RateLimitError);
    });

    it('should refill tokens after time passes', async () => {
      plugin._rateLimitTokens = 0;
      plugin._lastRateLimitRefill = Date.now() - 2000; // 2 seconds ago

      // Should refill 200 tokens (100 per second * 2 seconds)
      await plugin._checkRateLimit();
      expect(plugin._rateLimitTokens).toBeGreaterThan(0);
    });
  });

  describe('Backoff Calculation', () => {
    it('should calculate exponential backoff with jitter', () => {
      plugin.retryPolicy = {
        initialDelay: 1000,
        maxDelay: 60000,
        multiplier: 2,
        jitter: 0.1
      };

      const delay1 = plugin._calculateBackoff(0); // 1000ms
      const delay2 = plugin._calculateBackoff(1); // 2000ms
      const delay3 = plugin._calculateBackoff(2); // 4000ms

      expect(delay1).toBeGreaterThanOrEqual(900); // With jitter
      expect(delay1).toBeLessThanOrEqual(1100);
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it('should cap delay at maxDelay', () => {
      plugin.retryPolicy = {
        initialDelay: 1000,
        maxDelay: 10000,
        multiplier: 2,
        jitter: 0
      };

      // 1000 * 2^10 = 1,024,000ms, capped at 10,000ms
      const delay = plugin._calculateBackoff(10);
      expect(delay).toBeLessThanOrEqual(10000);
    });
  });

  describe('Plugin Status', () => {
    it('should return plugin status', () => {
      const status = plugin.getStatus();

      expect(status).toHaveProperty('name', 'SMTPPlugin');
      expect(status).toHaveProperty('mode', 'relay');
      expect(status).toHaveProperty('connected');
      expect(status).toHaveProperty('queuedEmails', 0);
      expect(status).toHaveProperty('rateLimitTokens');
    });
  });
});
