/**
 * HttpStage
 *
 * HTTP header analysis:
 * - Server identification
 * - Security headers
 * - Technology fingerprinting from headers
 */

export class HttpStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target) {
    const url = this._buildUrl(target);
    const args = [
      '-I',
      '-sS',
      '-L',
      '--max-time',
      String(Math.ceil(this.config.curl.timeout / 1000)),
      '--user-agent',
      this.config.curl.userAgent,
      url
    ];

    const result = await this.commandRunner.run('curl', args, {
      timeout: this.config.curl.timeout
    });

    if (!result.ok) {
      return {
        status: 'unavailable',
        message: result.error?.message || 'curl failed',
        stderr: result.stderr
      };
    }

    const headers = this._parseCurlHeaders(result.stdout);

    return {
      status: 'ok',
      url,
      headers,
      raw: this.config.storage.persistRawOutput ? this._truncateOutput(result.stdout) : undefined
    };
  }

  _buildUrl(target) {
    const protocol = target.protocol || 'https';
    const port = target.port && target.port !== this._defaultPortForProtocol(protocol)
      ? `:${target.port}`
      : '';
    const path = target.path || '';
    return `${protocol}://${target.host}${port}${path}`;
  }

  _defaultPortForProtocol(protocol) {
    switch (protocol) {
      case 'http':
        return 80;
      case 'https':
        return 443;
      default:
        return null;
    }
  }

  _parseCurlHeaders(raw) {
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const headers = {};
    for (const line of lines) {
      if (!line.includes(':')) continue;
      const [key, ...rest] = line.split(':');
      headers[key.trim().toLowerCase()] = rest.join(':').trim();
    }
    return headers;
  }

  _truncateOutput(text, maxLength = 10000) {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '\n... (truncated)';
  }
}
