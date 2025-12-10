/**
 * WhoisStage
 *
 * WHOIS lookup using RedBlue:
 * - Domain registration information
 * - Registrar, dates, nameservers
 * - Contact information (if available)
 */

import type { CommandRunner } from '../concerns/command-runner.js';

export interface ReconPlugin {
  commandRunner: CommandRunner;
}

export interface Target {
  host: string;
  protocol?: string;
  port?: number;
  path?: string;
}

export interface WhoisFeatureConfig {
  timeout?: number;
  raw?: boolean;
}

export interface Registrant {
  name: string | null;
  organization: string | null;
  email: string | null;
  country: string | null;
}

export interface Dates {
  created: string | null;
  updated: string | null;
  expiration: string | null;
  daysUntilExpiration?: number;
}

export interface WhoisData {
  domain: string | null;
  registrar: string | null;
  registrant: Registrant;
  dates: Dates;
  nameservers: string[];
  domainStatus: string[];
  dnssec: string | null;
  raw?: string | null;
  expirationStatus?: string;
}

export interface WhoisResult {
  status: 'ok' | 'empty' | 'unavailable' | 'error';
  message?: string;
  domain?: string;
  registrar?: string | null;
  registrant?: Registrant;
  dates?: Dates;
  nameservers?: string[];
  domainStatus?: string[];
  dnssec?: string | null;
  raw?: string | null;
  expirationStatus?: string;
  metadata?: Record<string, any>;
}

export class WhoisStage {
  private plugin: ReconPlugin;
  private commandRunner: CommandRunner;

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
  }

  async execute(target: Target, featureConfig: WhoisFeatureConfig = {}): Promise<WhoisResult> {
    const domain = this._extractBaseDomain(target.host);

    const result = await this.commandRunner.runRedBlue(
      'recon',
      'domain',
      'whois',
      domain,
      {
        timeout: featureConfig.timeout || 30000,
        flags: featureConfig.raw ? ['--raw'] : []
      }
    );

    if (result.status === 'unavailable') {
      return {
        status: 'unavailable',
        message: 'RedBlue (rb) is not available',
        metadata: result.metadata
      };
    }

    if (result.status === 'error') {
      return {
        status: 'error',
        message: result.error,
        metadata: result.metadata
      };
    }

    const whoisData = this._normalizeWhois(result.data);

    if (whoisData.dates?.expiration) {
      const expirationDate = new Date(whoisData.dates.expiration);
      const now = new Date();
      const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      whoisData.dates.daysUntilExpiration = daysUntilExpiration;

      if (daysUntilExpiration < 0) {
        whoisData.expirationStatus = 'expired';
      } else if (daysUntilExpiration < 30) {
        whoisData.expirationStatus = 'expiring-soon';
      }
    }

    return {
      status: whoisData.domain ? 'ok' : 'empty',
      domain: whoisData.domain ?? domain,
      registrar: whoisData.registrar,
      registrant: whoisData.registrant,
      dates: whoisData.dates,
      nameservers: whoisData.nameservers,
      domainStatus: whoisData.domainStatus,
      dnssec: whoisData.dnssec,
      raw: whoisData.raw,
      expirationStatus: whoisData.expirationStatus,
      metadata: result.metadata
    };
  }

  private _extractBaseDomain(host: string): string {
    let domain = host.replace(/^https?:\/\//, '');
    domain = domain.split(':')[0]!;
    domain = domain.split('/')[0]!;

    const parts = domain.split('.');
    const specialTlds = ['co.uk', 'com.br', 'com.au', 'co.jp', 'co.za', 'com.mx', 'com.ar'];
    const lastTwoParts = parts.slice(-2).join('.');

    if (specialTlds.includes(lastTwoParts)) {
      return parts.slice(-3).join('.');
    }

    return parts.slice(-2).join('.');
  }

  private _normalizeWhois(data: any): WhoisData {
    if (!data || typeof data !== 'object') {
      return {
        domain: null,
        registrar: null,
        registrant: { name: null, organization: null, email: null, country: null },
        dates: { created: null, updated: null, expiration: null },
        nameservers: [],
        domainStatus: [],
        dnssec: null
      };
    }

    if (data.raw && typeof data.raw === 'string') {
      return this._parseRawWhois(data.raw);
    }

    return {
      domain: data.domain || data.domainName || null,
      registrar: data.registrar || data.registrarName || null,
      registrant: {
        name: data.registrantName || data.registrant?.name || null,
        organization: data.registrantOrganization || data.registrant?.organization || null,
        email: data.registrantEmail || data.registrant?.email || null,
        country: data.registrantCountry || data.registrant?.country || null
      },
      dates: {
        created: data.createdDate || data.creationDate || data.created || null,
        updated: data.updatedDate || data.updateDate || data.updated || null,
        expiration: data.expiryDate || data.expirationDate || data.expires || null
      },
      nameservers: data.nameservers || data.nameServers || data.ns || [],
      domainStatus: data.status || data.domainStatus || [],
      dnssec: data.dnssec || null,
      raw: data.raw || null
    };
  }

  private _parseRawWhois(raw: string): WhoisData {
    const result: WhoisData = {
      domain: null,
      registrar: null,
      registrant: { name: null, organization: null, email: null, country: null },
      dates: { created: null, updated: null, expiration: null },
      nameservers: [],
      domainStatus: [],
      dnssec: null,
      raw
    };

    const patterns: Record<string, RegExp> = {
      domain: /Domain Name:\s*(.+)/i,
      registrar: /Registrar:\s*(.+)/i,
      createdDate: /Creat(?:ed|ion) Date:\s*(.+)/i,
      updatedDate: /Updat(?:ed|e) Date:\s*(.+)/i,
      expiryDate: /(?:Expir(?:y|ation)|Registry Expiry) Date:\s*(.+)/i,
      dnssec: /DNSSEC:\s*(.+)/i
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = raw.match(pattern);
      if (match) {
        if (key === 'domain') result.domain = match[1]!.trim();
        else if (key === 'registrar') result.registrar = match[1]!.trim();
        else if (key === 'createdDate') result.dates.created = this._parseDate(match[1]!.trim());
        else if (key === 'updatedDate') result.dates.updated = this._parseDate(match[1]!.trim());
        else if (key === 'expiryDate') result.dates.expiration = this._parseDate(match[1]!.trim());
        else if (key === 'dnssec') result.dnssec = match[1]!.trim().toLowerCase();
      }
    }

    const nsMatches = raw.matchAll(/Name Server:\s*(.+)/gi);
    for (const match of nsMatches) {
      result.nameservers.push(match[1]!.trim().toLowerCase());
    }

    const statusMatches = raw.matchAll(/(?:Domain )?Status:\s*(.+)/gi);
    for (const match of statusMatches) {
      result.domainStatus.push(match[1]!.trim());
    }

    const registrantPatterns: Record<keyof Registrant, RegExp> = {
      name: /Registrant Name:\s*(.+)/i,
      organization: /Registrant Organization:\s*(.+)/i,
      email: /Registrant Email:\s*(.+)/i,
      country: /Registrant Country:\s*(.+)/i
    };

    for (const [key, pattern] of Object.entries(registrantPatterns)) {
      const match = raw.match(pattern);
      if (match) {
        result.registrant[key as keyof Registrant] = match[1]!.trim();
      }
    }

    return result;
  }

  private _parseDate(dateStr: string | null): string | null {
    if (!dateStr) return null;

    try {
      const cleaned = dateStr
        .replace(/\s*\([^)]+\)/g, '')
        .replace(/\s+[A-Z]{3,4}$/, '')
        .trim();

      const date = new Date(cleaned);
      return !isNaN(date.getTime()) ? date.toISOString() : null;
    } catch {
      return null;
    }
  }
}
