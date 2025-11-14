/**
 * Multi-Relay Manager
 * Supports multiple SMTP relays with failover, load balancing, and domain routing
 */

import { createDriver } from './driver-factory.js';

export class MultiRelayManager {
  constructor(options = {}) {
    this.relays = new Map(); // name -> driver instance
    this.strategy = options.strategy || 'failover'; // 'failover', 'round-robin', 'domain-based'
    this.domainMap = options.domainMap || {}; // domain -> relay name mapping
    this.currentIndex = 0; // for round-robin
    this.options = options;
    this._initialized = false;
  }

  /**
   * Initialize multi-relay with list of relay configurations
   * @param {Array} relayConfigs - Array of { name, driver, config }
   */
  async initialize(relayConfigs = []) {
    if (!relayConfigs || relayConfigs.length === 0) {
      throw new Error('At least one relay configuration required');
    }

    try {
      for (const relayConfig of relayConfigs) {
        const { name, driver, config } = relayConfig;
        if (!name || !driver) {
          throw new Error('Each relay requires "name" and "driver"');
        }

        const relayDriver = await createDriver(driver, config);
        this.relays.set(name, {
          driver: relayDriver,
          config: relayConfig,
          failures: 0,
          lastError: null,
          isHealthy: true
        });
      }

      if (this.relays.size === 0) {
        throw new Error('No relays successfully initialized');
      }

      this._initialized = true;
    } catch (err) {
      throw new Error(`Failed to initialize multi-relay: ${err.message}`);
    }
  }

  /**
   * Send email using selected relay based on strategy
   */
  async sendEmail(emailData) {
    if (!this._initialized) {
      throw new Error('Multi-relay not initialized');
    }

    const relayName = this._selectRelay(emailData);
    const relayInfo = this.relays.get(relayName);

    if (!relayInfo) {
      throw new Error(`Relay "${relayName}" not found`);
    }

    try {
      const result = await relayInfo.driver.sendEmail(emailData);
      relayInfo.failures = 0;
      relayInfo.lastError = null;
      relayInfo.isHealthy = true;
      return {
        ...result,
        relayUsed: relayName
      };
    } catch (err) {
      relayInfo.failures++;
      relayInfo.lastError = err.message;

      // Mark as unhealthy after 3 failures
      if (relayInfo.failures >= 3) {
        relayInfo.isHealthy = false;
      }

      // Try next relay if failover enabled
      if (this.strategy === 'failover') {
        const nextRelay = this._getNextHealthyRelay();
        if (nextRelay && nextRelay !== relayName) {
          return await this.sendEmail(emailData);
        }
      }

      throw err;
    }
  }

  /**
   * Select relay based on strategy
   * @private
   */
  _selectRelay(emailData) {
    if (this.strategy === 'domain-based') {
      return this._selectByDomain(emailData.to);
    } else if (this.strategy === 'round-robin') {
      return this._selectRoundRobin();
    } else {
      // failover (default)
      return this._selectHealthy();
    }
  }

  /**
   * Select relay by recipient domain
   * @private
   */
  _selectByDomain(recipient) {
    if (typeof recipient === 'string') {
      const domain = recipient.split('@')[1];
      const relayName = this.domainMap[domain];
      if (relayName && this.relays.has(relayName)) {
        return relayName;
      }
    }

    // Fallback to first healthy relay
    return this._selectHealthy();
  }

  /**
   * Select relay using round-robin
   * @private
   */
  _selectRoundRobin() {
    const relayNames = Array.from(this.relays.keys());
    const relayName = relayNames[this.currentIndex % relayNames.length];
    this.currentIndex++;
    return relayName;
  }

  /**
   * Select first healthy relay
   * @private
   */
  _selectHealthy() {
    for (const [name, info] of this.relays) {
      if (info.isHealthy) {
        return name;
      }
    }

    // If all unhealthy, use first one (will likely fail again and trigger error handling)
    return this.relays.keys().next().value;
  }

  /**
   * Get next healthy relay (for failover)
   * @private
   */
  _getNextHealthyRelay() {
    const healthyRelays = Array.from(this.relays.entries())
      .filter(([_, info]) => info.isHealthy)
      .map(([name, _]) => name);

    return healthyRelays[0] || null;
  }

  /**
   * Get status of all relays
   */
  getStatus() {
    const status = {};
    for (const [name, info] of this.relays) {
      status[name] = {
        healthy: info.isHealthy,
        failures: info.failures,
        lastError: info.lastError
      };
    }
    return status;
  }

  /**
   * Reset failure count for a relay
   */
  resetRelay(name) {
    const relay = this.relays.get(name);
    if (relay) {
      relay.failures = 0;
      relay.lastError = null;
      relay.isHealthy = true;
    }
  }

  /**
   * Reset all relays
   */
  resetAll() {
    for (const info of this.relays.values()) {
      info.failures = 0;
      info.lastError = null;
      info.isHealthy = true;
    }
  }

  /**
   * Close all relay drivers
   */
  async close() {
    for (const info of this.relays.values()) {
      await info.driver.close();
    }
    this.relays.clear();
    this._initialized = false;
  }
}
