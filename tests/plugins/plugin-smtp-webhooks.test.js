import { WebhookReceiver } from '../../src/plugins/smtp/webhook-receiver.js';
import { SMTPError } from '../../src/plugins/smtp/errors.js';

describe('WebhookReceiver', () => {
  let receiver;

  beforeEach(() => {
    receiver = new WebhookReceiver({
      provider: 'sendgrid',
      webhookSecret: 'test-secret'
    });
  });

  describe('SendGrid Event Parsing', () => {
    it('should parse SendGrid bounce event', async () => {
      const payload = [
        {
          email: 'john@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          event: 'bounce',
          bounce_type: 'permanent',
          bounce_subtype: 'general',
          reason: 'Invalid address'
        }
      ];

      const events = receiver._parseSendGridEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('bounce');
      expect(events[0].recipient).toBe('john@example.com');
      expect(events[0].bounceType).toBe('permanent');
    });

    it('should parse SendGrid complaint event', async () => {
      const payload = [
        {
          email: 'jane@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          event: 'spamreport',
          sg_message_id: 'msg123'
        }
      ];

      const events = receiver._parseSendGridEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('complaint');
      expect(events[0].complaintType).toBe('abuse');
    });

    it('should parse SendGrid delivery event', async () => {
      const payload = [
        {
          email: 'bob@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          event: 'delivered'
        }
      ];

      const events = receiver._parseSendGridEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('delivery');
    });

    it('should parse SendGrid open event', async () => {
      const payload = [
        {
          email: 'alice@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          event: 'open',
          useragent: 'Mozilla/5.0',
          ip: '192.168.1.1'
        }
      ];

      const events = receiver._parseSendGridEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('open');
      expect(events[0].userAgent).toBe('Mozilla/5.0');
      expect(events[0].ip).toBe('192.168.1.1');
    });

    it('should parse SendGrid click event', async () => {
      const payload = [
        {
          email: 'user@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          event: 'click',
          url: 'https://example.com/link',
          useragent: 'Mozilla/5.0',
          ip: '192.168.1.1'
        }
      ];

      const events = receiver._parseSendGridEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('click');
      expect(events[0].url).toBe('https://example.com/link');
    });

    it('should parse multiple SendGrid events', async () => {
      const payload = [
        {
          email: 'user1@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          event: 'delivered'
        },
        {
          email: 'user2@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          event: 'bounce',
          bounce_type: 'temporary'
        }
      ];

      const events = receiver._parseSendGridEvents(payload);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('delivery');
      expect(events[1].type).toBe('bounce');
    });
  });

  describe('AWS SES Event Parsing', () => {
    it('should parse AWS SES bounce event', async () => {
      const payload = {
        Type: 'Notification',
        Message: JSON.stringify({
          eventType: 'Bounce',
          bounce: {
            bounceType: 'Permanent',
            bouncedRecipients: [
              {
                emailAddress: 'user@example.com',
                status: '5.1.1',
                diagnosticCode: 'smtp; 550 user unknown'
              }
            ],
            timestamp: new Date().toISOString()
          },
          mail: {
            messageId: 'msg-123'
          }
        })
      };

      const events = await receiver._parseAwsSesEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('bounce');
      expect(events[0].recipient).toBe('user@example.com');
      expect(events[0].bounceType).toBe('hard');
    });

    it('should parse AWS SES complaint event', async () => {
      const payload = {
        Type: 'Notification',
        Message: JSON.stringify({
          eventType: 'Complaint',
          complaint: {
            complaintFeedbackType: 'abuse',
            complainedRecipients: [
              {
                emailAddress: 'user@example.com'
              }
            ],
            timestamp: new Date().toISOString()
          },
          mail: {
            messageId: 'msg-123'
          }
        })
      };

      const events = await receiver._parseAwsSesEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('complaint');
      expect(events[0].complaintType).toBe('abuse');
    });

    it('should parse AWS SES delivery event', async () => {
      const payload = {
        Type: 'Notification',
        Message: JSON.stringify({
          eventType: 'Delivery',
          delivery: {
            recipients: ['user@example.com'],
            timestamp: new Date().toISOString()
          },
          mail: {
            messageId: 'msg-123'
          }
        })
      };

      const events = await receiver._parseAwsSesEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('delivery');
    });
  });

  describe('Mailgun Event Parsing', () => {
    it('should parse Mailgun failed event', async () => {
      const payload = {
        'event-data': {
          event: 'failed',
          recipient: 'user@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          severity: 'permanent',
          reason: 'bounce',
          code: 550,
          message: { id: 'msg-123' }
        }
      };

      const events = receiver._parseMailgunEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('bounce');
      expect(events[0].bounceType).toBe('hard');
    });

    it('should parse Mailgun complained event', async () => {
      const payload = {
        'event-data': {
          event: 'complained',
          recipient: 'user@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          message: { id: 'msg-123' }
        }
      };

      const events = receiver._parseMailgunEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('complaint');
      expect(events[0].complaintType).toBe('abuse');
    });
  });

  describe('Postmark Event Parsing', () => {
    it('should parse Postmark bounce event', async () => {
      const payload = {
        Bounces: [
          {
            ID: 12345,
            Type: 'HardBounce',
            MessageID: 'msg-123',
            Email: 'user@example.com',
            BouncedAt: new Date().toISOString(),
            Description: 'Hard bounce'
          }
        ]
      };

      const events = receiver._parsePostmarkEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('bounce');
      expect(events[0].bounceType).toBe('hard');
    });

    it('should parse Postmark complaint event', async () => {
      const payload = {
        Complaints: [
          {
            ID: 67890,
            MessageID: 'msg-123',
            Email: 'user@example.com',
            ComplainedAt: new Date().toISOString(),
            Description: 'Spam complaint'
          }
        ]
      };

      const events = receiver._parsePostmarkEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('complaint');
    });
  });

  describe('Event Handlers', () => {
    it('should register and call event handler', async () => {
      let calledWith = null;

      receiver.on('bounce', async (event) => {
        calledWith = event;
      });

      const payload = [
        {
          email: 'user@example.com',
          event: 'bounce',
          bounce_type: 'permanent'
        }
      ];

      // Simulate receiving webhook (without signature validation)
      const events = receiver._parseSendGridEvents(payload);
      await receiver._dispatchEvent(events[0]);

      expect(calledWith).not.toBeNull();
      expect(calledWith.type).toBe('bounce');
    });

    it('should support multiple handlers for same event', async () => {
      const calls = [];

      receiver.on('bounce', async () => {
        calls.push(1);
      });

      receiver.on('bounce', async () => {
        calls.push(2);
      });

      const event = {
        type: 'bounce',
        recipient: 'user@example.com',
        bounceType: 'hard'
      };

      await receiver._dispatchEvent(event);

      expect(calls).toEqual([1, 2]);
    });

    it('should remove event handler', () => {
      const handler = async () => {};
      receiver.on('bounce', handler);
      receiver.off('bounce', handler);

      const handlers = receiver.webhooks || {};
      const bounceHandlers = handlers.bounce || [];
      expect(bounceHandlers).not.toContain(handler);
    });
  });

  describe('Event Log', () => {
    it('should log events', async () => {
      const event = {
        type: 'bounce',
        recipient: 'user@example.com',
        messageId: 'msg-123'
      };

      await receiver._dispatchEvent(event);

      const log = receiver.getEventLog();
      expect(log.length).toBeGreaterThan(0);
      expect(log[0].type).toBe('bounce');
    });

    it('should limit event log size', async () => {
      const smallReceiver = new WebhookReceiver({
        provider: 'sendgrid',
        maxEventLogSize: 3
      });

      for (let i = 0; i < 5; i++) {
        const event = {
          type: 'bounce',
          recipient: `user${i}@example.com`,
          messageId: `msg-${i}`
        };
        await smallReceiver._dispatchEvent(event);
      }

      const log = smallReceiver.getEventLog();
      expect(log.length).toBe(3);
    });

    it('should clear event log', async () => {
      const event = {
        type: 'bounce',
        recipient: 'user@example.com'
      };

      await receiver._dispatchEvent(event);
      let log = receiver.getEventLog();
      expect(log.length).toBeGreaterThan(0);

      receiver.clearEventLog();
      log = receiver.getEventLog();
      expect(log).toHaveLength(0);
    });
  });

  describe('Handler Count', () => {
    it('should count registered handlers', () => {
      receiver.on('bounce', async () => {});
      receiver.on('bounce', async () => {});
      receiver.on('complaint', async () => {});

      const counts = receiver.getHandlerCount();

      expect(counts.bounce).toBe(2);
      expect(counts.complaint).toBe(1);
    });
  });

  describe('Generic Event Parsing', () => {
    it('should parse generic event format (array)', () => {
      const payload = [
        {
          type: 'bounce',
          messageId: 'msg-123',
          recipient: 'user@example.com',
          bounceType: 'hard'
        }
      ];

      const events = receiver._parseGenericEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('bounce');
    });

    it('should parse generic event format (events key)', () => {
      const payload = {
        events: [
          {
            type: 'bounce',
            messageId: 'msg-123',
            recipient: 'user@example.com'
          }
        ]
      };

      const events = receiver._parseGenericEvents(payload);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('bounce');
    });
  });
});
