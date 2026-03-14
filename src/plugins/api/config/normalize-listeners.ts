import { normalizeBasePath } from '../utils/base-path.js';
import type {
  ApiListenerConfig,
  ApiListenerConfigInput,
  ApiListenerConfigInputProtocol,
  ApiListenerHttpConfig,
  ApiListenerTcpConfig,
  ApiListenerUdpConfig,
  ApiListenerWebSocketConfig,
  ApiListenerWebSocketProtocolHandlers
} from '../types.internal.js';

const KNOWN_PROTOCOLS = ['http', 'websocket', 'tcp', 'udp'] as const;
type KnownProtocol = (typeof KNOWN_PROTOCOLS)[number];

interface BindDefaults {
  host: string;
  port: number;
}

const DEFAULT_HTTP_PATH = '';
const DEFAULT_WEBSOCKET_PATH = '';
const DEFAULT_WEBSOCKET_MAX_PAYLOAD = 1024 * 1024;
const DEFAULT_UDP_MAX_MESSAGE = 65507;

function isKnownProtocol(value: string): value is KnownProtocol {
  return KNOWN_PROTOCOLS.includes(value as KnownProtocol);
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

function normalizePath(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') {
    return normalizeBasePath(fallback) || '';
  }

  const normalized = normalizeBasePath(value);
  return normalized || normalizeBasePath(fallback) || '';
}

function hasEnabledProtocol(protocols: Record<string, ApiListenerConfigInputProtocol | boolean>): boolean {
  return Object.values(protocols).some((protocol) => {
    if (typeof protocol === 'boolean') {
      return protocol;
    }

    return protocol.enabled !== false;
  });
}

function normalizeCustomProtocolEntry(value: unknown): ApiListenerConfigInputProtocol | boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return { enabled: false };
  }

  const source = value as Record<string, unknown>;
  const normalized = {
    ...source,
    enabled: asBoolean(source.enabled, true)
  } as ApiListenerConfigInputProtocol;

  if ('path' in source) {
    normalized.path = normalizePath(source.path);
  }

  if ('maxPayloadBytes' in source) {
    normalized.maxPayloadBytes = asNumber(source.maxPayloadBytes) ?? undefined;
  }

  if ('maxMessageBytes' in source) {
    normalized.maxMessageBytes = asNumber(source.maxMessageBytes) ?? undefined;
  }

  return normalized;
}

function normalizeCustomProtocols(raw: Record<string, unknown>): Record<string, ApiListenerConfigInputProtocol | boolean> {
  const output: Record<string, ApiListenerConfigInputProtocol | boolean> = {};

  Object.entries(raw).forEach(([protocolName, protocolConfig]) => {
    if (isKnownProtocol(protocolName)) {
      return;
    }

    if (protocolConfig === undefined) {
      return;
    }

    output[protocolName] = normalizeCustomProtocolEntry(protocolConfig);
  });

  return output;
}

function normalizeBooleanTransportConfig(
  value: unknown,
  fallbackEnabled: boolean,
  fallbackPath: string
): { enabled: boolean; path: string; maxPayloadBytes: number; maxMessageBytes: number } {
  if (typeof value === 'boolean') {
    return {
      enabled: value,
      path: fallbackPath,
      maxPayloadBytes: DEFAULT_WEBSOCKET_MAX_PAYLOAD,
      maxMessageBytes: DEFAULT_UDP_MAX_MESSAGE
    };
  }

  if (!value || typeof value !== 'object') {
    return {
      enabled: fallbackEnabled,
      path: fallbackPath,
      maxPayloadBytes: DEFAULT_WEBSOCKET_MAX_PAYLOAD,
      maxMessageBytes: DEFAULT_UDP_MAX_MESSAGE
    };
  }

  const input = value as Record<string, unknown>;
  const path = normalizePath(input.path);

  return {
    enabled: asBoolean(input.enabled, fallbackEnabled),
    path,
    maxPayloadBytes: asNumber(input.maxPayloadBytes) ?? DEFAULT_WEBSOCKET_MAX_PAYLOAD,
    maxMessageBytes: asNumber(input.maxMessageBytes) ?? DEFAULT_UDP_MAX_MESSAGE
  };
}

function extractWebSocketCallbacks(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const source = raw as Record<string, unknown>;
  return {
    onConnection: typeof source.onConnection === 'function' ? source.onConnection : undefined,
    onMessage: typeof source.onMessage === 'function' ? source.onMessage : undefined,
    onClose: typeof source.onClose === 'function' ? source.onClose : undefined
  };
}

function extractUdpCallbacks(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const source = raw as Record<string, unknown>;
  return {
    onMessage: typeof source.onMessage === 'function' ? source.onMessage : undefined,
    onError: typeof source.onError === 'function' ? source.onError : undefined
  };
}

function extractTcpCallbacks(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const source = raw as Record<string, unknown>;
  return {
    onConnection: typeof source.onConnection === 'function' ? source.onConnection : undefined,
    onData: typeof source.onData === 'function' ? source.onData : undefined,
    onClose: typeof source.onClose === 'function' ? source.onClose : undefined,
    onError: typeof source.onError === 'function' ? source.onError : undefined
  };
}

function normalizeProtocolConfig(
  source: ApiListenerConfigInput,
  listenerIndex: number,
  fallbackToHttp: boolean
): ApiListenerConfig['protocols'] {
  const protocolsRaw =
    source.protocols && typeof source.protocols === 'object' && !Array.isArray(source.protocols)
      ? source.protocols as Record<string, unknown>
      : undefined;

  const hasProtocolDefinition = !!protocolsRaw
    || source.http !== undefined
    || source.websocket !== undefined
    || source.tcp !== undefined
    || source.udp !== undefined;

  const rawHttp =
    protocolsRaw?.http !== undefined
      ? protocolsRaw.http
      : source.http;
  const rawWebSocket =
    protocolsRaw?.websocket !== undefined
      ? protocolsRaw.websocket
      : source.websocket;
  const rawUdp =
    protocolsRaw?.udp !== undefined
      ? protocolsRaw.udp
      : source.udp;
  const rawTcp =
    protocolsRaw?.tcp !== undefined
      ? protocolsRaw.tcp
      : source.tcp;

  const httpDefaultEnabled = !hasProtocolDefinition;
  const wsDefaultEnabled = false;
  const udpDefaultEnabled = false;
  const tcpDefaultEnabled = false;

  const httpConfig = normalizeBooleanTransportConfig(rawHttp, httpDefaultEnabled, DEFAULT_HTTP_PATH);
  const websocketConfig = normalizeBooleanTransportConfig(rawWebSocket, wsDefaultEnabled, DEFAULT_WEBSOCKET_PATH);
  const udpConfig = normalizeBooleanTransportConfig(rawUdp, udpDefaultEnabled, '');
  const tcpEnabled = typeof rawTcp === 'boolean'
    ? rawTcp
    : typeof rawTcp === 'object' && rawTcp !== null
      ? asBoolean((rawTcp as Record<string, unknown>).enabled, tcpDefaultEnabled)
      : tcpDefaultEnabled;

  const custom = protocolsRaw ? normalizeCustomProtocols(protocolsRaw) : {};
  const hasTransport = httpConfig.enabled || websocketConfig.enabled || udpConfig.enabled || tcpEnabled || hasEnabledProtocol(custom);

  if (!hasTransport) {
    throw new Error(`ApiPlugin listener at index ${listenerIndex} has no enabled transport protocol.`);
  }

  return {
    http: {
      enabled: httpConfig.enabled,
      path: httpConfig.path
    } as ApiListenerHttpConfig,
    websocket: {
      enabled: websocketConfig.enabled,
      path: websocketConfig.path,
      maxPayloadBytes: websocketConfig.maxPayloadBytes,
      ...(extractWebSocketCallbacks(rawWebSocket) as ApiListenerWebSocketProtocolHandlers)
    } as ApiListenerWebSocketConfig & ApiListenerWebSocketProtocolHandlers,
    tcp: {
      enabled: tcpEnabled,
      ...(extractTcpCallbacks(rawTcp) as {
        onConnection?: (socket: unknown) => void;
        onData?: (socket: unknown, data: Buffer) => void;
        onClose?: (socket: unknown, hadError: boolean) => void;
        onError?: (error: Error) => void;
      })
    } as ApiListenerTcpConfig,
    udp: {
      enabled: udpConfig.enabled,
      maxMessageBytes: udpConfig.maxMessageBytes,
      ...(extractUdpCallbacks(rawUdp) as {
        onMessage?: (message: Buffer, remoteInfo: { address: string; port: number; family: string; size: number }) => void;
        onError?: (error: Error) => void;
      })
    } as ApiListenerUdpConfig,
    custom: custom
  };
}

function normalizeBindConfig(
  source: ApiListenerConfigInput,
  defaults: BindDefaults,
  listenerIndex: number
): ApiListenerConfig['bind'] {
  const rawBind = source.bind || {};

  const host = asString(rawBind.host) || defaults.host;
  const port = asNumber(rawBind.port);

  if (port == null) {
    return {
      host,
      port: defaults.port
    };
  }

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`ApiPlugin listener #${listenerIndex} has invalid bind.port: ${port}`);
  }

  return {
    host,
    port
  };
}

export function normalizeApiListeners(
  listeners: ApiListenerConfigInput | ApiListenerConfigInput[] | undefined,
  defaults: BindDefaults
): ApiListenerConfig[] {
  const inputListeners = Array.isArray(listeners)
    ? listeners
    : listeners
      ? [listeners]
      : [];

  const normalized: ApiListenerConfig[] = [];
  const seenBinds = new Set<string>();

  inputListeners.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      return;
    }

    const bind = normalizeBindConfig(raw, defaults, index);
    const bindKey = `${bind.host}:${bind.port}`;

    if (seenBinds.has(bindKey)) {
      throw new Error(`ApiPlugin listener bind ${bindKey} was configured more than once. Merge these into a single listener with http/websocket/udp/custom protocols.`);
    }

    seenBinds.add(bindKey);

    const protocols = normalizeProtocolConfig(raw, index, true);

    const normalizedProtocol: ApiListenerConfig = {
      name: asString(raw.name) || `listener-${index + 1}`,
      bind,
      protocols
    };

    normalized.push(normalizedProtocol);
  });

  if (!normalized.length) {
    normalized.push({
      name: 'default',
      bind: {
        host: defaults.host,
        port: defaults.port
      },
      protocols: {
        http: { enabled: true, path: DEFAULT_HTTP_PATH },
        websocket: { enabled: false, path: DEFAULT_WEBSOCKET_PATH, maxPayloadBytes: DEFAULT_WEBSOCKET_MAX_PAYLOAD },
        tcp: { enabled: false },
        udp: { enabled: false, maxMessageBytes: DEFAULT_UDP_MAX_MESSAGE },
        custom: {}
      }
    });
  }

  return normalized;
}
