/**
 * EventualConsistencyPlugin New Analytics Functions Tests
 * Tests the 6 new analytics functions added in v11.0.4
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistencyPlugin - New Analytics Functions', () => {
  let database;
  let wallets;
  let plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-analytics-new');

    // Create wallets resource
    wallets = await database.createResource({
      name: 'wallets',
      attributes: {
        id: 'string|required',
        userId: 'string|required',
        balance: 'number|default:0'
      }
    });

    // Add EventualConsistencyPlugin with analytics enabled
    plugin = new EventualConsistencyPlugin({
      resources: {
        wallets: ['balance']
      },
      consolidation: { mode: 'sync', auto: false },
      analytics: { enabled: true }
    });

    await database.usePlugin(plugin);
    await plugin.start();

    // Insert test data
    await wallets.insert({ id: 'w1', userId: 'u1', balance: 0 });
    await wallets.add('w1', 'balance', 100);
    await wallets.consolidate('w1', 'balance');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  describe('getYearByDay()', () => {
    it('should return daily breakdown for a year with fillGaps', async () => {
      const currentYear = new Date().getFullYear();

      const yearByDay = await plugin.getYearByDay('wallets', 'balance', currentYear, {
        fillGaps: true
      });

      // Check that we got 365 or 366 days (depending on leap year)
      const isLeapYear = (currentYear % 4 === 0 && currentYear % 100 !== 0) || (currentYear % 400 === 0);
      const expectedDays = isLeapYear ? 366 : 365;

      expect(yearByDay.length).toBe(expectedDays);

      // Verify first and last day
      expect(yearByDay[0].cohort).toBe(`${currentYear}-01-01`);
      expect(yearByDay[expectedDays - 1].cohort).toBe(`${currentYear}-12-31`);

      // Check structure
      expect(yearByDay[0]).toHaveProperty('count');
      expect(yearByDay[0]).toHaveProperty('sum');
      expect(yearByDay[0]).toHaveProperty('avg');
    });

    it('should return only days with data without fillGaps', async () => {
      const currentYear = new Date().getFullYear();

      const yearByDay = await plugin.getYearByDay('wallets', 'balance', currentYear);

      // Without fillGaps, should only return days with transactions
      expect(yearByDay.length).toBeGreaterThan(0);
      expect(yearByDay.length).toBeLessThan(365);

      // All returned days should have data
      for (const day of yearByDay) {
        expect(day.count).toBeGreaterThan(0);
      }
    });
  });

  describe('getWeekByDay()', () => {
    it('should return 7 days for a specific week with fillGaps', async () => {
      // Get current week cohort
      const today = new Date();
      const weekCohort = getISOWeekString(today);

      const weekByDay = await plugin.getWeekByDay('wallets', 'balance', weekCohort, {
        fillGaps: true
      });

      // Should always return exactly 7 days
      expect(weekByDay.length).toBe(7);

      // Check structure
      for (let i = 0; i < 7; i++) {
        expect(weekByDay[i]).toHaveProperty('cohort');
        expect(weekByDay[i]).toHaveProperty('count');
        expect(weekByDay[i]).toHaveProperty('sum');
      }
    });

    it('should handle ISO 8601 week format correctly', async () => {
      // Test with explicit week format '2025-W42'
      const weekCohort = '2025-W42';

      const weekByDay = await plugin.getWeekByDay('wallets', 'balance', weekCohort, {
        fillGaps: true
      });

      expect(weekByDay.length).toBe(7);

      // Week should start on Monday (ISO 8601)
      // First day should be a Monday
      const firstDay = new Date(weekByDay[0].cohort);
      const dayOfWeek = firstDay.getDay();
      expect(dayOfWeek).toBe(1); // Monday
    });
  });

  describe('getWeekByHour()', () => {
    it('should return 168 hours for a specific week with fillGaps', async () => {
      const today = new Date();
      const weekCohort = getISOWeekString(today);

      const weekByHour = await plugin.getWeekByHour('wallets', 'balance', weekCohort, {
        fillGaps: true
      });

      // Should always return exactly 168 hours (7 days × 24 hours)
      expect(weekByHour.length).toBe(168);

      // Check structure
      expect(weekByHour[0]).toHaveProperty('cohort');
      expect(weekByHour[0]).toHaveProperty('count');
      expect(weekByHour[0]).toHaveProperty('sum');

      // Verify hour format (should be YYYY-MM-DDTHH)
      expect(weekByHour[0].cohort).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/);
    });

    it('should return only hours with data without fillGaps', async () => {
      const today = new Date();
      const weekCohort = getISOWeekString(today);

      const weekByHour = await plugin.getWeekByHour('wallets', 'balance', weekCohort);

      // Without fillGaps, should only return hours with transactions
      expect(weekByHour.length).toBeGreaterThan(0);
      expect(weekByHour.length).toBeLessThan(168);

      // All returned hours should have data
      for (const hour of weekByHour) {
        expect(hour.count).toBeGreaterThan(0);
      }
    });
  });

  describe('getLastNHours()', () => {
    it('should return last 24 hours by default with fillGaps', async () => {
      const lastHours = await plugin.getLastNHours('wallets', 'balance', 24, {
        fillGaps: true
      });

      // Should return exactly 24 hours
      expect(lastHours.length).toBe(24);

      // Check structure
      expect(lastHours[0]).toHaveProperty('cohort');
      expect(lastHours[0]).toHaveProperty('count');
      expect(lastHours[0]).toHaveProperty('sum');

      // Verify chronological order (oldest to newest)
      for (let i = 1; i < lastHours.length; i++) {
        expect(lastHours[i].cohort).toBeGreaterThan(lastHours[i - 1].cohort);
      }
    });

    it('should support custom hour count', async () => {
      const lastHours = await plugin.getLastNHours('wallets', 'balance', 12, {
        fillGaps: true
      });

      expect(lastHours.length).toBe(12);
    });

    it('should work without fillGaps', async () => {
      const lastHours = await plugin.getLastNHours('wallets', 'balance', 24);

      // Without fillGaps, should only return hours with transactions
      expect(lastHours.length).toBeGreaterThan(0);
      expect(lastHours.length).toBeLessThanOrEqual(24);
    });
  });

  describe('getLastNWeeks()', () => {
    it('should return last 4 weeks by default', async () => {
      const lastWeeks = await plugin.getLastNWeeks('wallets', 'balance', 4);

      // Should return up to 4 weeks (may be less if test runs early)
      expect(lastWeeks.length).toBeGreaterThan(0);
      expect(lastWeeks.length).toBeLessThanOrEqual(5); // May span 5 weeks depending on dates

      // Check structure
      if (lastWeeks.length > 0) {
        expect(lastWeeks[0]).toHaveProperty('cohort');
        expect(lastWeeks[0]).toHaveProperty('count');
        expect(lastWeeks[0]).toHaveProperty('sum');

        // Verify week format (should be YYYY-Www)
        expect(lastWeeks[0].cohort).toMatch(/^\d{4}-W\d{2}$/);
      }
    });

    it('should support custom week count', async () => {
      const lastWeeks = await plugin.getLastNWeeks('wallets', 'balance', 2);

      expect(lastWeeks.length).toBeGreaterThan(0);
      expect(lastWeeks.length).toBeLessThanOrEqual(3);
    });

    it('should return weeks in chronological order', async () => {
      const lastWeeks = await plugin.getLastNWeeks('wallets', 'balance', 4);

      // Verify chronological order
      for (let i = 1; i < lastWeeks.length; i++) {
        expect(lastWeeks[i].cohort).toBeGreaterThan(lastWeeks[i - 1].cohort);
      }
    });
  });

  describe('getLastNMonths()', () => {
    it('should return last 12 months by default with fillGaps', async () => {
      const lastMonths = await plugin.getLastNMonths('wallets', 'balance', 12, {
        fillGaps: true
      });

      // Should return exactly 12 months
      expect(lastMonths.length).toBe(12);

      // Check structure
      expect(lastMonths[0]).toHaveProperty('cohort');
      expect(lastMonths[0]).toHaveProperty('count');
      expect(lastMonths[0]).toHaveProperty('sum');

      // Verify month format (should be YYYY-MM)
      expect(lastMonths[0].cohort).toMatch(/^\d{4}-\d{2}$/);

      // Verify chronological order
      for (let i = 1; i < lastMonths.length; i++) {
        expect(lastMonths[i].cohort).toBeGreaterThan(lastMonths[i - 1].cohort);
      }
    });

    it('should support custom month count', async () => {
      const lastMonths = await plugin.getLastNMonths('wallets', 'balance', 6, {
        fillGaps: true
      });

      expect(lastMonths.length).toBe(6);
    });

    it('should work without fillGaps', async () => {
      const lastMonths = await plugin.getLastNMonths('wallets', 'balance', 12);

      // Without fillGaps, should only return months with transactions
      expect(lastMonths.length).toBeGreaterThan(0);
      expect(lastMonths.length).toBeLessThanOrEqual(12);

      // All returned months should have data
      for (const month of lastMonths) {
        expect(month.count).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error when analytics not enabled', async () => {
      const pluginNoAnalytics = new EventualConsistencyPlugin({
        resources: {
          wallets: ['balance']
        }
      });

      await expect(
        pluginNoAnalytics.getYearByDay('wallets', 'balance', 2025)
      ).rejects.toThrow('Analytics not enabled');

      await expect(
        pluginNoAnalytics.getWeekByDay('wallets', 'balance', '2025-W42')
      ).rejects.toThrow('Analytics not enabled');

      await expect(
        pluginNoAnalytics.getWeekByHour('wallets', 'balance', '2025-W42')
      ).rejects.toThrow('Analytics not enabled');

      await expect(
        pluginNoAnalytics.getLastNHours('wallets', 'balance', 24)
      ).rejects.toThrow('Analytics not enabled');

      await expect(
        pluginNoAnalytics.getLastNWeeks('wallets', 'balance', 4)
      ).rejects.toThrow('Analytics not enabled');

      await expect(
        pluginNoAnalytics.getLastNMonths('wallets', 'balance', 12)
      ).rejects.toThrow('Analytics not enabled');
    });

    it('should throw error when resource not configured', async () => {
      await expect(
        plugin.getYearByDay('nonexistent', 'balance', 2025)
      ).rejects.toThrow('No eventual consistency configured');
    });

    it('should throw error when field not configured', async () => {
      await expect(
        plugin.getYearByDay('wallets', 'nonexistent', 2025)
      ).rejects.toThrow('No eventual consistency configured for field');
    });
  });
});

/**
 * Helper function to get ISO week string from date
 * @param {Date} date
 * @returns {string} Week in format YYYY-Www
 */
function getISOWeekString(date) {
  const target = new Date(date.valueOf());
  const dayNr = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);

  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const firstThursday = new Date(yearStart.valueOf());
  if (yearStart.getUTCDay() !== 4) {
    firstThursday.setUTCDate(yearStart.getUTCDate() + ((4 - yearStart.getUTCDay()) + 7) % 7);
  }

  const weekNumber = 1 + Math.round((target - firstThursday) / 604800000);
  const weekYear = target.getUTCFullYear();

  return `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
}
