import { dictionaryEncode, dictionaryDecode } from './dictionary-encoding.js';

export type EncodingType = 'none' | 'special' | 'ascii' | 'url' | 'base64' | 'dictionary';

export interface AnalysisStats {
  ascii: number;
  latin1: number;
  multibyte: number;
}

export interface AnalysisResult {
  type: EncodingType;
  safe: boolean;
  reason?: string;
  stats?: AnalysisStats;
}

export interface EncodeResult {
  encoded: string;
  encoding: EncodingType;
  analysis?: AnalysisResult;
  dictionaryType?: 'exact' | 'prefix';
  savings?: number;
  compressionRatio?: string;
  reason?: string;
}

export interface EncodedSizeInfo {
  original: number;
  encoded: number;
  overhead: number;
  ratio: number;
  encoding: EncodingType;
}

interface CommonValueEntry {
  encoded: string;
  encoding: EncodingType;
}

const analysisCache = new Map<string, AnalysisResult>();
const MAX_CACHE_SIZE = 500;

function isAsciiOnly(str: string): boolean {
  return /^[\x20-\x7E]*$/.test(str);
}

export function analyzeString(str: string): AnalysisResult {
  if (!str || typeof str !== 'string') {
    return { type: 'none', safe: true };
  }

  if (analysisCache.has(str)) {
    return analysisCache.get(str)!;
  }

  if (isAsciiOnly(str)) {
    const result: AnalysisResult = {
      type: 'ascii',
      safe: true,
      stats: { ascii: str.length, latin1: 0, multibyte: 0 }
    };

    cacheAnalysisResult(str, result);
    return result;
  }

  let asciiCount = 0;
  let latin1Count = 0;
  let multibyteCount = 0;

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);

    if (code >= 0x20 && code <= 0x7E) {
      asciiCount++;
    } else if (code < 0x20 || code === 0x7F) {
      multibyteCount++;
    } else if (code >= 0x80 && code <= 0xFF) {
      latin1Count++;
    } else {
      multibyteCount++;
    }
  }

  const hasMultibyte = multibyteCount > 0;
  const hasLatin1 = latin1Count > 0;

  let result: AnalysisResult;

  if (!hasLatin1 && !hasMultibyte) {
    result = {
      type: 'ascii',
      safe: true,
      stats: { ascii: asciiCount, latin1: 0, multibyte: 0 }
    };
  } else if (hasMultibyte) {
    const multibyteRatio = multibyteCount / str.length;
    if (multibyteRatio > 0.3) {
      result = {
        type: 'base64',
        safe: false,
        reason: 'high multibyte content',
        stats: { ascii: asciiCount, latin1: latin1Count, multibyte: multibyteCount }
      };
    } else {
      result = {
        type: 'url',
        safe: false,
        reason: 'contains multibyte characters',
        stats: { ascii: asciiCount, latin1: latin1Count, multibyte: multibyteCount }
      };
    }
  } else {
    const latin1Ratio = latin1Count / str.length;
    if (latin1Ratio > 0.5) {
      result = {
        type: 'base64',
        safe: false,
        reason: 'high Latin-1 content',
        stats: { ascii: asciiCount, latin1: latin1Count, multibyte: 0 }
      };
    } else {
      result = {
        type: 'url',
        safe: false,
        reason: 'contains Latin-1 extended characters',
        stats: { ascii: asciiCount, latin1: latin1Count, multibyte: 0 }
      };
    }
  }

  cacheAnalysisResult(str, result);
  return result;
}

function cacheAnalysisResult(str: string, result: AnalysisResult): void {
  if (analysisCache.size >= MAX_CACHE_SIZE) {
    const firstKey = analysisCache.keys().next().value;
    if (firstKey !== undefined) {
      analysisCache.delete(firstKey);
    }
  }
  analysisCache.set(str, result);
}

const COMMON_VALUES: Record<string, CommonValueEntry> = {
  'active': { encoded: 'active', encoding: 'none' },
  'inactive': { encoded: 'inactive', encoding: 'none' },
  'pending': { encoded: 'pending', encoding: 'none' },
  'completed': { encoded: 'completed', encoding: 'none' },
  'failed': { encoded: 'failed', encoding: 'none' },
  'success': { encoded: 'success', encoding: 'none' },
  'error': { encoded: 'error', encoding: 'none' },
  'processing': { encoded: 'processing', encoding: 'none' },
  'queued': { encoded: 'queued', encoding: 'none' },
  'cancelled': { encoded: 'cancelled', encoding: 'none' },
  'GET': { encoded: 'GET', encoding: 'none' },
  'POST': { encoded: 'POST', encoding: 'none' },
  'PUT': { encoded: 'PUT', encoding: 'none' },
  'DELETE': { encoded: 'DELETE', encoding: 'none' },
  'PATCH': { encoded: 'PATCH', encoding: 'none' },
  'HEAD': { encoded: 'HEAD', encoding: 'none' },
  'OPTIONS': { encoded: 'OPTIONS', encoding: 'none' },
  '200': { encoded: '200', encoding: 'none' },
  '201': { encoded: '201', encoding: 'none' },
  '204': { encoded: '204', encoding: 'none' },
  '301': { encoded: '301', encoding: 'none' },
  '302': { encoded: '302', encoding: 'none' },
  '304': { encoded: '304', encoding: 'none' },
  '400': { encoded: '400', encoding: 'none' },
  '401': { encoded: '401', encoding: 'none' },
  '403': { encoded: '403', encoding: 'none' },
  '404': { encoded: '404', encoding: 'none' },
  '405': { encoded: '405', encoding: 'none' },
  '409': { encoded: '409', encoding: 'none' },
  '422': { encoded: '422', encoding: 'none' },
  '429': { encoded: '429', encoding: 'none' },
  '500': { encoded: '500', encoding: 'none' },
  '502': { encoded: '502', encoding: 'none' },
  '503': { encoded: '503', encoding: 'none' },
  '504': { encoded: '504', encoding: 'none' },
  'OK': { encoded: 'OK', encoding: 'none' },
  'Created': { encoded: 'Created', encoding: 'none' },
  'paid': { encoded: 'paid', encoding: 'none' },
  'unpaid': { encoded: 'unpaid', encoding: 'none' },
  'refunded': { encoded: 'refunded', encoding: 'none' },
  'pending_payment': { encoded: 'pending_payment', encoding: 'none' },
  'authorized': { encoded: 'authorized', encoding: 'none' },
  'captured': { encoded: 'captured', encoding: 'none' },
  'declined': { encoded: 'declined', encoding: 'none' },
  'voided': { encoded: 'voided', encoding: 'none' },
  'chargeback': { encoded: 'chargeback', encoding: 'none' },
  'disputed': { encoded: 'disputed', encoding: 'none' },
  'settled': { encoded: 'settled', encoding: 'none' },
  'reversed': { encoded: 'reversed', encoding: 'none' },
  'shipped': { encoded: 'shipped', encoding: 'none' },
  'delivered': { encoded: 'delivered', encoding: 'none' },
  'returned': { encoded: 'returned', encoding: 'none' },
  'in_transit': { encoded: 'in_transit', encoding: 'none' },
  'out_for_delivery': { encoded: 'out_for_delivery', encoding: 'none' },
  'ready_to_ship': { encoded: 'ready_to_ship', encoding: 'none' },
  'backordered': { encoded: 'backordered', encoding: 'none' },
  'pre_order': { encoded: 'pre_order', encoding: 'none' },
  'on_hold': { encoded: 'on_hold', encoding: 'none' },
  'awaiting_pickup': { encoded: 'awaiting_pickup', encoding: 'none' },
  'admin': { encoded: 'admin', encoding: 'none' },
  'moderator': { encoded: 'moderator', encoding: 'none' },
  'owner': { encoded: 'owner', encoding: 'none' },
  'editor': { encoded: 'editor', encoding: 'none' },
  'viewer': { encoded: 'viewer', encoding: 'none' },
  'contributor': { encoded: 'contributor', encoding: 'none' },
  'guest': { encoded: 'guest', encoding: 'none' },
  'member': { encoded: 'member', encoding: 'none' },
  'trace': { encoded: 'trace', encoding: 'none' },
  'debug': { encoded: 'debug', encoding: 'none' },
  'info': { encoded: 'info', encoding: 'none' },
  'warn': { encoded: 'warn', encoding: 'none' },
  'fatal': { encoded: 'fatal', encoding: 'none' },
  'emergency': { encoded: 'emergency', encoding: 'none' },
  'dev': { encoded: 'dev', encoding: 'none' },
  'development': { encoded: 'development', encoding: 'none' },
  'staging': { encoded: 'staging', encoding: 'none' },
  'production': { encoded: 'production', encoding: 'none' },
  'test': { encoded: 'test', encoding: 'none' },
  'qa': { encoded: 'qa', encoding: 'none' },
  'uat': { encoded: 'uat', encoding: 'none' },
  'create': { encoded: 'create', encoding: 'none' },
  'read': { encoded: 'read', encoding: 'none' },
  'update': { encoded: 'update', encoding: 'none' },
  'delete': { encoded: 'delete', encoding: 'none' },
  'list': { encoded: 'list', encoding: 'none' },
  'search': { encoded: 'search', encoding: 'none' },
  'count': { encoded: 'count', encoding: 'none' },
  'enabled': { encoded: 'enabled', encoding: 'none' },
  'disabled': { encoded: 'disabled', encoding: 'none' },
  'archived': { encoded: 'archived', encoding: 'none' },
  'draft': { encoded: 'draft', encoding: 'none' },
  'published': { encoded: 'published', encoding: 'none' },
  'scheduled': { encoded: 'scheduled', encoding: 'none' },
  'expired': { encoded: 'expired', encoding: 'none' },
  'locked': { encoded: 'locked', encoding: 'none' },
  'low': { encoded: 'low', encoding: 'none' },
  'medium': { encoded: 'medium', encoding: 'none' },
  'high': { encoded: 'high', encoding: 'none' },
  'urgent': { encoded: 'urgent', encoding: 'none' },
  'critical': { encoded: 'critical', encoding: 'none' },
  'true': { encoded: 'true', encoding: 'none' },
  'false': { encoded: 'false', encoding: 'none' },
  'yes': { encoded: 'yes', encoding: 'none' },
  'no': { encoded: 'no', encoding: 'none' },
  'on': { encoded: 'on', encoding: 'none' },
  'off': { encoded: 'off', encoding: 'none' },
  '1': { encoded: '1', encoding: 'none' },
  '0': { encoded: '0', encoding: 'none' },
  'null': { encoded: 'null', encoding: 'special' },
  'undefined': { encoded: 'undefined', encoding: 'special' },
  'none': { encoded: 'none', encoding: 'none' },
  'N/A': { encoded: 'N/A', encoding: 'none' }
};

export function metadataEncode(value: unknown): EncodeResult {
  if (value === null) {
    return { encoded: 'null', encoding: 'special' };
  }
  if (value === undefined) {
    return { encoded: 'undefined', encoding: 'special' };
  }

  const stringValue = String(value);

  if (stringValue.startsWith('d:') || stringValue.startsWith('u:') || stringValue.startsWith('b:')) {
    return {
      encoded: 'b:' + Buffer.from(stringValue, 'utf8').toString('base64'),
      encoding: 'base64',
      reason: 'force-encoded to prevent decoding ambiguity'
    };
  }

  const dictResult = dictionaryEncode(stringValue);
  if (dictResult && dictResult.savings > 0) {
    return {
      encoded: dictResult.encoded,
      encoding: 'dictionary',
      dictionaryType: dictResult.dictionaryType,
      savings: dictResult.savings,
      compressionRatio: (dictResult.encodedLength / dictResult.originalLength).toFixed(3)
    };
  }

  if (COMMON_VALUES[stringValue]) {
    return COMMON_VALUES[stringValue];
  }

  const analysis = analyzeString(stringValue);

  switch (analysis.type) {
    case 'none':
    case 'ascii':
      return {
        encoded: stringValue,
        encoding: 'none',
        analysis
      };

    case 'url':
      return {
        encoded: 'u:' + encodeURIComponent(stringValue),
        encoding: 'url',
        analysis
      };

    case 'base64':
      return {
        encoded: 'b:' + Buffer.from(stringValue, 'utf8').toString('base64'),
        encoding: 'base64',
        analysis
      };

    default:
      return {
        encoded: 'b:' + Buffer.from(stringValue, 'utf8').toString('base64'),
        encoding: 'base64',
        analysis
      };
  }
}

export function metadataDecode(value: unknown): unknown {
  if (value === 'null') {
    return null;
  }
  if (value === 'undefined') {
    return undefined;
  }

  if (value === null || value === undefined || typeof value !== 'string') {
    return value;
  }

  if (value.startsWith('d:')) {
    const decoded = dictionaryDecode(value);
    if (decoded !== null) {
      return decoded;
    }
  }

  if (value.length >= 2) {
    const firstChar = value.charCodeAt(0);
    const secondChar = value.charCodeAt(1);

    if (secondChar === 58) {
      if (firstChar === 117) {
        if (value.length === 2) return value;
        try {
          return decodeURIComponent(value.substring(2));
        } catch {
          return value;
        }
      }

      if (firstChar === 98) {
        if (value.length === 2) return value;
        try {
          const decoded = Buffer.from(value.substring(2), 'base64').toString('utf8');
          return decoded;
        } catch {
          return value;
        }
      }
    }
  }

  return value;
}

export function calculateEncodedSize(value: string): EncodedSizeInfo {
  const analysis = analyzeString(value);
  const originalSize = Buffer.byteLength(value, 'utf8');

  let encodedSize: number;
  switch (analysis.type) {
    case 'none':
    case 'ascii':
      encodedSize = originalSize;
      break;
    case 'url':
      encodedSize = 2 + encodeURIComponent(value).length;
      break;
    case 'base64':
      encodedSize = 2 + Buffer.from(value, 'utf8').toString('base64').length;
      break;
    default:
      encodedSize = 2 + Buffer.from(value, 'utf8').toString('base64').length;
  }

  return {
    original: originalSize,
    encoded: encodedSize,
    overhead: encodedSize - originalSize,
    ratio: encodedSize / originalSize,
    encoding: analysis.type
  };
}
