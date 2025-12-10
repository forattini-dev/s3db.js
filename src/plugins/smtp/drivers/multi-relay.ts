import { createDriver } from './driver-factory.js';
import { SMTPRelayDriver, DriverConfig, EmailData, SendResult } from './relay-driver.js';

export type RelayStrategy = 'failover' | 'round-robin' | 'domain-based';

export interface MultiRelayOptions {
  strategy?: RelayStrategy;
  domainMap?: Record<string, string>;
}

export interface RelayConfig {
  name: string;
  driver: string;
  config?: DriverConfig;
}

export interface RelayInfo {
  driver: SMTPRelayDriver;
  config: RelayConfig;
  failures: number;
  lastError: string | null;
  isHealthy: boolean;
}

export interface RelayStatus {
  healthy: boolean;
  failures: number;
  lastError: string | null;
}

export interface MultiRelaySendResult extends SendResult {
  relayUsed: string;
}

export class MultiRelayManager {
  public relays: Map<string, RelayInfo>;
  public strategy: RelayStrategy;
  public domainMap: Record<string, string>;
  public currentIndex: number;
  public options: MultiRelayOptions;
  private _initialized: boolean;

  constructor(options: MultiRelayOptions = {}) {
    this.relays = new Map();
    this.strategy = options.strategy || 'failover';
    this.domainMap = options.domainMap || {};
    this.currentIndex = 0;
    this.options = options;
    this._initialized = false;
  }

  async initialize(relayConfigs: RelayConfig[] = []): Promise<void> {
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
      throw new Error(`Failed to initialize multi-relay: ${(err as Error).message}`);
    }
  }

  async sendEmail(emailData: EmailData): Promise<MultiRelaySendResult> {
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
      relayInfo.lastError = (err as Error).message;

      if (relayInfo.failures >= 3) {
        relayInfo.isHealthy = false;
      }

      if (this.strategy === 'failover') {
        const nextRelay = this._getNextHealthyRelay();
        if (nextRelay && nextRelay !== relayName) {
          return await this.sendEmail(emailData);
        }
      }

      throw err;
    }
  }

  private _selectRelay(emailData: EmailData): string {
    if (this.strategy === 'domain-based') {
      return this._selectByDomain(emailData.to);
    } else if (this.strategy === 'round-robin') {
      return this._selectRoundRobin();
    } else {
      return this._selectHealthy();
    }
  }

  private _selectByDomain(recipient: string | string[] | undefined): string {
    if (typeof recipient === 'string') {
      const domain = recipient.split('@')[1]!;
      const relayName = this.domainMap[domain];
      if (relayName && this.relays.has(relayName)) {
        return relayName;
      }
    }

    return this._selectHealthy();
  }

  private _selectRoundRobin(): string {
    const relayNames = Array.from(this.relays.keys());
    const relayName = relayNames[this.currentIndex % relayNames.length] ?? '';
    this.currentIndex++;
    return relayName;
  }

  private _selectHealthy(): string {
    for (const [name, info] of this.relays) {
      if (info.isHealthy) {
        return name;
      }
    }

    return this.relays.keys().next().value!;
  }

  private _getNextHealthyRelay(): string | null {
    const healthyRelays = Array.from(this.relays.entries())
      .filter(([_, info]) => info.isHealthy)
      .map(([name, _]) => name);

    return healthyRelays[0] || null;
  }

  getStatus(): Record<string, RelayStatus> {
    const status: Record<string, RelayStatus> = {};
    for (const [name, info] of this.relays) {
      status[name] = {
        healthy: info.isHealthy,
        failures: info.failures,
        lastError: info.lastError
      };
    }
    return status;
  }

  resetRelay(name: string): void {
    const relay = this.relays.get(name);
    if (relay) {
      relay.failures = 0;
      relay.lastError = null;
      relay.isHealthy = true;
    }
  }

  resetAll(): void {
    for (const info of this.relays.values()) {
      info.failures = 0;
      info.lastError = null;
      info.isHealthy = true;
    }
  }

  async close(): Promise<void> {
    for (const info of this.relays.values()) {
      await info.driver.close();
    }
    this.relays.clear();
    this._initialized = false;
  }
}
