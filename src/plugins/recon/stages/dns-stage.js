/**
 * DnsStage
 *
 * DNS enumeration stage:
 * - A, AAAA, NS, MX, TXT records
 * - Reverse DNS lookups
 * - Error tracking per record type
 */

import dns from 'dns/promises';

export class DnsStage {
  constructor(plugin) {
    this.plugin = plugin;
  }

  async execute(target) {
    const result = {
      status: 'ok',
      records: {},
      errors: {}
    };

    try {
      const lookups = await Promise.allSettled([
        dns.lookup(target.host, { all: true }),
        dns.resolve4(target.host),
        dns.resolve6(target.host).catch(() => []),
        dns.resolveNs(target.host).catch(() => []),
        dns.resolveMx(target.host).catch(() => []),
        dns.resolveTxt(target.host).catch(() => [])
      ]);

      const [lookupAll, aRecords, aaaaRecords, nsRecords, mxRecords, txtRecords] = lookups;

      if (lookupAll.status === 'fulfilled') {
        result.records.lookup = lookupAll.value;
      } else {
        result.errors.lookup = lookupAll.reason?.message;
      }

      result.records.a = aRecords.status === 'fulfilled' ? aRecords.value : [];
      if (aRecords.status === 'rejected') {
        result.errors.a = aRecords.reason?.message;
      }

      result.records.aaaa = aaaaRecords.status === 'fulfilled' ? aaaaRecords.value : [];
      if (aaaaRecords.status === 'rejected') {
        result.errors.aaaa = aaaaRecords.reason?.message;
      }

      result.records.ns = nsRecords.status === 'fulfilled' ? nsRecords.value : [];
      if (nsRecords.status === 'rejected') {
        result.errors.ns = nsRecords.reason?.message;
      }

      result.records.mx = mxRecords.status === 'fulfilled' ? mxRecords.value : [];
      if (mxRecords.status === 'rejected') {
        result.errors.mx = mxRecords.reason?.message;
      }

      result.records.txt = txtRecords.status === 'fulfilled' ? txtRecords.value : [];
      if (txtRecords.status === 'rejected') {
        result.errors.txt = txtRecords.reason?.message;
      }

      const allIps = [
        ...(result.records.a || []),
        ...(result.records.aaaa || [])
      ];

      if (allIps.length > 0) {
        const reverseLookups = await Promise.allSettled(
          allIps.map(async (ip) => {
            try {
              const hosts = await dns.reverse(ip);
              return { ip, hosts };
            } catch (error) {
              return { ip, hosts: [], error };
            }
          })
        );

        result.records.reverse = {};
        for (const entry of reverseLookups) {
          if (entry.status === 'fulfilled') {
            const { ip, hosts, error } = entry.value;
            result.records.reverse[ip] = hosts;
            if (error) {
              result.errors[`reverse:${ip}`] = error?.message;
            }
          } else if (entry.reason?.ip) {
            result.records.reverse[entry.reason.ip] = [];
            result.errors[`reverse:${entry.reason.ip}`] = entry.reason.error?.message;
          }
        }
      } else {
        result.records.reverse = {};
      }
    } catch (error) {
      result.status = 'error';
      result.message = error?.message || 'DNS lookup failed';
    }

    return result;
  }
}
