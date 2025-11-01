/**
 * SubdomainsStage
 *
 * Subdomain enumeration with multiple tools:
 * - amass (OWASP, comprehensive)
 * - subfinder (fast, API-based)
 * - assetfinder (passive)
 * - crt.sh (certificate transparency logs)
 */

export class SubdomainsStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target, featureConfig = {}) {
    const aggregated = new Set();
    const sources = {};

    const executeCliCollector = async (name, command, args, parser) => {
      if (!featureConfig[name]) {
        return;
      }
      const run = await this.commandRunner.run(command, args, { timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
      if (!run.ok) {
        sources[name] = {
          status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
          message: run.error?.message || `${command} failed`,
          stderr: run.stderr
        };
        return;
      }
      const items = parser(run.stdout, run.stderr);
      items.forEach((item) => aggregated.add(item));
      sources[name] = {
        status: 'ok',
        count: items.length,
        sample: items.slice(0, 10)
      };
      if (this.config.storage.persistRawOutput) {
        sources[name].raw = this._truncateOutput(run.stdout);
      }
    };

    await executeCliCollector('amass', 'amass', ['enum', '-d', target.host, '-o', '-'], (stdout) =>
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    );

    await executeCliCollector('subfinder', 'subfinder', ['-d', target.host, '-silent'], (stdout) =>
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    );

    await executeCliCollector('assetfinder', 'assetfinder', ['--subs-only', target.host], (stdout) =>
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    );

    if (featureConfig.crtsh) {
      try {
        const response = await fetch(`https://crt.sh/?q=%25.${target.host}&output=json`, {
          headers: { 'User-Agent': this.config.curl.userAgent },
          signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
        });
        if (response.ok) {
          const data = await response.json();
          const entries = Array.isArray(data) ? data : [];
          const hostnames = entries
            .map((entry) => entry.name_value)
            .filter(Boolean)
            .flatMap((value) => value.split('\n'))
            .map((value) => value.trim())
            .filter(Boolean);
          hostnames.forEach((hostname) => aggregated.add(hostname));
          sources.crtsh = {
            status: 'ok',
            count: hostnames.length,
            sample: hostnames.slice(0, 10)
          };
        } else {
          sources.crtsh = {
            status: 'error',
            message: `crt.sh responded with status ${response.status}`
          };
        }
      } catch (error) {
        sources.crtsh = {
          status: 'error',
          message: error?.message || 'crt.sh lookup failed'
        };
      }
    }

    const list = Array.from(aggregated).sort();

    return {
      _individual: sources,
      _aggregated: {
        status: list.length > 0 ? 'ok' : 'empty',
        total: list.length,
        list,
        sources
      },
      status: list.length > 0 ? 'ok' : 'empty',
      total: list.length,
      list,
      sources
    };
  }

  _truncateOutput(text, maxLength = 10000) {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '\n... (truncated)';
  }
}
