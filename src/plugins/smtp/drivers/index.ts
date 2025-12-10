export { createDriver, getAvailableDrivers } from './driver-factory.js';
export { SMTPRelayDriver } from './relay-driver.js';
export { MultiRelayManager } from './multi-relay.js';

export type {
  DriverConfig,
  DriverOptions,
  EmailData,
  SendResult,
  DriverInfo,
  SMTPAuth,
  ProviderConfig
} from './relay-driver.js';

export type {
  RelayStrategy,
  MultiRelayOptions,
  RelayConfig,
  RelayInfo,
  RelayStatus,
  MultiRelaySendResult
} from './multi-relay.js';
