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
export declare class MultiRelayManager {
    relays: Map<string, RelayInfo>;
    strategy: RelayStrategy;
    domainMap: Record<string, string>;
    currentIndex: number;
    options: MultiRelayOptions;
    private _initialized;
    constructor(options?: MultiRelayOptions);
    initialize(relayConfigs?: RelayConfig[]): Promise<void>;
    sendEmail(emailData: EmailData): Promise<MultiRelaySendResult>;
    private _selectRelay;
    private _selectByDomain;
    private _selectRoundRobin;
    private _selectHealthy;
    private _getNextHealthyRelay;
    getStatus(): Record<string, RelayStatus>;
    resetRelay(name: string): void;
    resetAll(): void;
    close(): Promise<void>;
}
//# sourceMappingURL=multi-relay.d.ts.map