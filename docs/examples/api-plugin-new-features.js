/**
 * API Plugin - New Features Demo
 *
 * Demonstrates:
 * 1. OpenGraph Helper for social media previews
 * 2. State Machine for notifications/attempts
 * 3. Pug template engine
 *
 * Run: node docs/examples/api-plugin-new-features.js
 */

import { Database, ApiPlugin } from '../../dist/s3db.es.js';
import {
  OpenGraphHelper,
  createNotificationStateMachine,
  createAttemptStateMachine,
  pugEngine
} from '../../dist/s3db.es.js';

// Database setup
const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/api-demo'
});

await db.connect();

// Create resources
const urls = await db.createResource({
  name: 'urls',
  attributes: {
    shortId: 'string|required',
    target: 'string|required',
    title: 'string',
    description: 'string',
    image: 'string'
  }
});

const notifications = await db.createResource({
  name: 'notifications',
  attributes: {
    urlId: 'string|required',
    eventName: 'string|required',
    channel: 'string|required',
    status: 'string|required|default:pending',
    lastTransition: 'string',
    lastTransitionAt: 'string',
    attemptCount: 'number|default:0',
    lastStatusCode: 'number',
    lastError: 'string'
  }
});

const attempts = await db.createResource({
  name: 'attempts',
  attributes: {
    notificationId: 'string|required',
    attemptNumber: 'number|required',
    channel: 'string|required',
    status: 'string|required|default:queued',
    data: 'object',
    response: 'object',
    statusCode: 'number',
    error: 'string',
    willRetry: 'boolean'
  }
});

// Initialize OpenGraph Helper
const ogHelper = new OpenGraphHelper({
  siteName: 'URL Shortener',
  locale: 'pt_BR',
  twitterSite: '@example',
  defaultImage: '/static/default-og.png'
});

// Initialize State Machines
const notificationSM = createNotificationStateMachine();
const attemptSM = createAttemptStateMachine();

// Setup API Plugin with new features
const apiPlugin = new ApiPlugin({
  port: 3000,
  verbose: true,

  // Pug template engine
  templates: {
    engine: 'pug',
    directory: './views'
  },

  // Custom routes with OpenGraph
  routes: {
    // Redirect with OpenGraph preview
    '/:id': {
      GET: async (c) => {
        const id = c.req.param('id');
        const url = await urls.get(id);

        if (!url) {
          return c.notFound();
        }

        // Generate OpenGraph tags
        const ogTags = ogHelper.generateTags({
          title: url.title || url.target,
          description: url.description,
          image: url.image || '/static/default-og.png',
          url: `http://localhost:3000/${url.shortId}`
        });

        // Return HTML with OG tags
        return c.html(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${url.title || 'Redirecting...'}</title>
            ${ogTags}
            <meta http-equiv="refresh" content="0;url=${url.target}">
          </head>
          <body>
            <p>Redirecting to ${url.target}...</p>
          </body>
          </html>
        `);
      }
    },

    // Notification processing with state machine
    '/admin/notifications/:id/process': {
      POST: async (c) => {
        const id = c.req.param('id');
        const notification = await notifications.get(id);

        if (!notification) {
          return c.json({ error: 'Notification not found' }, 404);
        }

        try {
          // Transition: pending → processing
          await notificationSM.transition(
            notification,
            'START_PROCESSING',
            notifications,
            { processingStartedAt: new Date().toISOString() }
          );

          // Create attempt
          const attempt = await attemptSM.create(attempts, {
            notificationId: notification.id,
            attemptNumber: notification.attemptCount + 1,
            channel: notification.channel,
            data: { url: 'https://webhook.example.com' }
          });

          // Start attempt
          await attemptSM.transition(
            attempt,
            'START',
            attempts,
            { startedAt: new Date().toISOString() }
          );

          // Simulate webhook send (success)
          const sendResult = { success: true, statusCode: 200 };

          // Complete attempt
          await attemptSM.transition(
            attempt,
            'SUCCEED',
            attempts,
            {
              statusCode: sendResult.statusCode,
              response: { success: true },
              completedAt: new Date().toISOString()
            }
          );

          // Complete notification
          await notificationSM.transition(
            notification,
            'COMPLETE',
            notifications,
            {
              completedAt: new Date().toISOString(),
              lastStatusCode: sendResult.statusCode
            }
          );

          return c.json({
            success: true,
            message: 'Notification processed successfully',
            notification: await notifications.get(id)
          });

        } catch (error) {
          return c.json({
            error: error.message,
            hint: 'Check if transition is valid for current state'
          }, 400);
        }
      }
    },

    // State machine info
    '/admin/notifications/:id/transitions': {
      GET: async (c) => {
        const id = c.req.param('id');
        const notification = await notifications.get(id);

        if (!notification) {
          return c.json({ error: 'Notification not found' }, 404);
        }

        const validTransitions = notificationSM.getValidTransitions(notification.status);
        const isTerminal = notificationSM.isTerminalState(notification.status);

        return c.json({
          notification: {
            id: notification.id,
            status: notification.status,
            lastTransition: notification.lastTransition
          },
          validTransitions,
          isTerminalState: isTerminal,
          availableActions: validTransitions.map(t => ({
            transition: t,
            description: getTransitionDescription(t)
          }))
        });
      }
    }
  }
});

// Helper function for transition descriptions
function getTransitionDescription(transition) {
  const descriptions = {
    START_PROCESSING: 'Begin processing the notification',
    COMPLETE: 'Mark notification as successfully delivered',
    FAIL: 'Mark notification as failed (max retries reached)',
    RETRY: 'Retry notification (revert to pending)'
  };
  return descriptions[transition] || 'Unknown transition';
}

// Use plugin
await db.use(apiPlugin);

console.log('✅ API Plugin with new features running at http://localhost:3000');
console.log('');
console.log('📋 Available endpoints:');
console.log('  GET  /:id                                    - Redirect with OpenGraph');
console.log('  POST /admin/notifications/:id/process        - Process notification with state machine');
console.log('  GET  /admin/notifications/:id/transitions    - Get valid transitions');
console.log('');
console.log('🧪 Try it:');
console.log('');
console.log('  # Create URL');
console.log('  curl -X POST http://localhost:3000/urls \\');
console.log('    -H "Content-Type: application/json" \\');
console.log('    -d \'{"shortId":"test","target":"https://example.com","title":"Test URL"}\'');
console.log('');
console.log('  # Create notification');
console.log('  curl -X POST http://localhost:3000/notifications \\');
console.log('    -H "Content-Type: application/json" \\');
console.log('    -d \'{"urlId":"test","eventName":"click","channel":"webhook"}\'');
console.log('');
console.log('  # Process notification');
console.log('  curl -X POST http://localhost:3000/admin/notifications/{id}/process');
console.log('');
console.log('  # Check valid transitions');
console.log('  curl http://localhost:3000/admin/notifications/{id}/transitions');
console.log('');
console.log('  # Visit redirect (see OpenGraph tags)');
console.log('  curl http://localhost:3000/test');
console.log('');
