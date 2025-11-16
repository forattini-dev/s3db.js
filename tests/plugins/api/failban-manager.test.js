import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import FailbanManager from '../../../src/plugins/api/concerns/failban-manager.js';

async function ensureFailbanResources(database, manager) {
  const bansName = manager.resourceNames.bans;
  if (!database.resources[bansName]) {
    await database.createResource({
      name: bansName,
      attributes: {
        ip: 'string|required',
        reason: 'string',
        violations: 'number',
        bannedAt: 'string',
        expiresAt: 'string|required',
        expiresAtCohort: 'string|optional',
        metadata: {
          userAgent: 'string',
          path: 'string',
          lastViolation: 'string'
        }
      },
      behavior: 'body-overflow',
      timestamps: true,
      partitions: {
        byExpiry: {
          fields: { expiresAtCohort: 'string' }
        }
      }
    });
  }

  const violationsName = manager.resourceNames.violations;
  if (!database.resources[violationsName]) {
    await database.createResource({
      name: violationsName,
      attributes: {
        ip: 'string|required',
        timestamp: 'string|required',
        type: 'string',
        path: 'string',
        userAgent: 'string'
      },
      behavior: 'body-overflow',
      timestamps: true
    });
  }
}

describe('FailbanManager', () => {
  let db;

  beforeAll(async () => {
    db = createDatabaseForTest('failban-manager', { logLevel: 'error' });
    await db.connect();
  });

  afterAll(async () => {
    await db?.disconnect();
  });

  it('creates resources during initialization and bans after repeated violations', async () => {
    const manager = new FailbanManager({
      database: db,
      enabled: true,
      logLevel: false,
      maxViolations: 2,
      violationWindow: 1000,
      banDuration: 10_000,
      whitelist: [],
      blacklist: []
    });

    manager._setupCleanupTimer = () => {};
    await ensureFailbanResources(db, manager);
    await manager.initialize();

    expect(db.resources[manager.resourceNames.bans]).toBeDefined();
    expect(db.resources[manager.resourceNames.violations]).toBeDefined();

    const offender = '203.0.113.1';
    await manager.recordViolation(offender, 'test', { path: '/login', userAgent: 'jest' });
    await manager.recordViolation(offender, 'test', { path: '/login', userAgent: 'jest' });

    const logged = await manager.violationsResource.query({ ip: offender });
    expect(logged.length).toBe(2);

    await manager.ban(offender, 'test threshold', {
      violationCount: logged.length,
      userAgent: 'jest',
      path: '/login'
    });
    expect(manager.isBanned(offender)).toBe(true);

    const ban = await manager.getBan(offender);
    expect(ban).not.toBeNull();
    expect(ban.reason).toContain('threshold');

    await manager.cleanup();
  });

  it('ignores whitelisted IPs when recording violations', async () => {
    const whitelistedIp = '198.51.100.5';
    const manager = new FailbanManager({
      database: db,
      enabled: true,
      logLevel: false,
      maxViolations: 1,
      whitelist: [whitelistedIp]
    });

    manager._setupCleanupTimer = () => {};
    await ensureFailbanResources(db, manager);
    await manager.initialize();
    await manager.recordViolation(whitelistedIp, 'test', { path: '/login', userAgent: 'jest' });
    expect(manager.isBanned(whitelistedIp)).toBe(false);

    await manager.cleanup();
  });
});
