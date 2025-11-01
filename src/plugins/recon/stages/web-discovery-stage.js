/**
 * WebDiscoveryStage
 *
 * Directory and endpoint fuzzing:
 * - ffuf (fast, flexible)
 * - feroxbuster (recursive)
 * - gobuster (reliable)
 */

export class WebDiscoveryStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target, featureConfig = {}) {
    if (!featureConfig) {
      return { status: 'disabled' };
    }

    const tools = {};
    const discovered = {};
    const allPaths = new Set();
    const wordlist = featureConfig.wordlist;
    const threads = featureConfig.threads ?? 50;

    const runDirBuster = async (name, command, args) => {
      const run = await this.commandRunner.run(command, args, {
        timeout: featureConfig.timeout ?? 60000,
        maxBuffer: 8 * 1024 * 1024
      });
      if (!run.ok) {
        tools[name] = {
          status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
          message: run.error?.message || `${command} failed`,
          stderr: run.stderr
        };
        return;
      }
      const findings = run.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      discovered[name] = findings;
      findings.forEach((item) => allPaths.add(item));
      tools[name] = {
        status: 'ok',
        count: findings.length,
        sample: findings.slice(0, 10)
      };
      if (this.config.storage.persistRawOutput) {
        tools[name].raw = this._truncateOutput(run.stdout);
      }
    };

    if (featureConfig.ffuf && wordlist) {
      await runDirBuster('ffuf', 'ffuf', ['-u', `${this._buildUrl(target)}/FUZZ`, '-w', wordlist, '-t', String(threads), '-mc', '200,204,301,302,307,401,403']);
    }

    if (featureConfig.feroxbuster && wordlist) {
      await runDirBuster('feroxbuster', 'feroxbuster', ['-u', this._buildUrl(target), '-w', wordlist, '--threads', String(threads), '--silent']);
    }

    if (featureConfig.gobuster && wordlist) {
      await runDirBuster('gobuster', 'gobuster', ['dir', '-u', this._buildUrl(target), '-w', wordlist, '-t', String(threads)]);
    }

    const total = Object.values(discovered).reduce((acc, list) => acc + list.length, 0);

    if (!total) {
      return {
        status: wordlist ? 'empty' : 'skipped',
        message: wordlist ? 'No endpoints discovered' : 'Wordlist not provided',
        tools
      };
    }

    const paths = Array.from(allPaths);

    return {
      _individual: tools,
      _aggregated: {
        status: 'ok',
        total,
        tools,
        paths
      },
      status: 'ok',
      total,
      tools,
      paths
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
    return protocol === 'http' ? 80 : protocol === 'https' ? 443 : null;
  }

  _truncateOutput(text, maxLength = 10000) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '\n... (truncated)';
  }
}
