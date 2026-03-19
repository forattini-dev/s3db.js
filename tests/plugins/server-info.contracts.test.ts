import { describe, expect, it } from 'vitest';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { IdentityPlugin } from '../../src/plugins/identity/index.js';

describe('Plugin server info contracts', () => {
  it('returns typed API server info with resources when server is attached', () => {
    const plugin = new ApiPlugin({
      port: 3100,
      host: '127.0.0.1',
      resources: {
        users: {}
      }
    });

    plugin.server = {
      getInfo: () => ({
        isRunning: true,
        port: 3100,
        host: '127.0.0.1',
        resources: 1
      })
    } as any;

    expect(plugin.getServerInfo()).toEqual({
      isRunning: true,
      port: 3100,
      host: '127.0.0.1',
      resources: 1
    });
  });

  it('returns typed Identity server info with issuer when server is attached', () => {
    const plugin = new IdentityPlugin({
      port: 4100,
      host: '127.0.0.1',
      issuer: 'http://127.0.0.1:4100',
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' }
      },
      logLevel: 'silent'
    });

    plugin.server = {
      getInfo: () => ({
        isRunning: true,
        port: 4100,
        host: '127.0.0.1',
        issuer: 'http://127.0.0.1:4100'
      })
    } as any;

    expect(plugin.getServerInfo()).toEqual({
      isRunning: true,
      port: 4100,
      host: '127.0.0.1',
      issuer: 'http://127.0.0.1:4100'
    });
  });
});
