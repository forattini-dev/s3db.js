/**
 * FingerprintStage
 *
 * Technology fingerprinting:
 * - whatweb (web technology identification)
 */

export class FingerprintStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target, featureConfig = {}) {
    const technologies = new Set();
    const tools = {};

    if (featureConfig.whatweb) {
      const run = await this.commandRunner.run('whatweb', ['-q', this._buildUrl(target)], {
        timeout: featureConfig.timeout ?? 20000,
        maxBuffer: 2 * 1024 * 1024
      });
      if (run.ok) {
        const parsed = run.stdout
          .split(/[\r\n]+/)
          .flatMap((line) => line.split(' '))
          .map((token) => token.trim())
          .filter((token) => token.includes('[') && token.includes(']'))
          .map((token) => token.substring(0, token.indexOf('[')));
        parsed.forEach((tech) => technologies.add(tech));
        tools.whatweb = { status: 'ok', technologies: parsed.slice(0, 20) };
        if (this.config.storage.persistRawOutput) {
          tools.whatweb.raw = this._truncateOutput(run.stdout);
        }
      } else {
        tools.whatweb = {
          status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
          message: run.error?.message || 'whatweb failed'
        };
      }
    }

    if (technologies.size === 0 && Object.keys(tools).length === 0) {
      return { status: 'skipped' };
    }

    return {
      _individual: tools,
      _aggregated: {
        status: technologies.size ? 'ok' : 'empty',
        technologies: Array.from(technologies),
        tools
      },
      status: technologies.size ? 'ok' : 'empty',
      technologies: Array.from(technologies),
      tools
    };
  }

  _buildUrl(target) {
    const protocol = target.protocol || 'https';
    const port = target.port && target.port !== (protocol === 'http' ? 80 : 443) ? `:${target.port}` : '';
    return `${protocol}://${target.host}${port}${target.path || ''}`;
  }

  _truncateOutput(text, maxLength = 10000) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '\n... (truncated)';
  }
}
