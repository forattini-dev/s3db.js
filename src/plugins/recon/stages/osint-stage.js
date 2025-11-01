/**
 * OsintStage
 *
 * OSINT (Open Source Intelligence) gathering:
 * - theHarvester (email, subdomain, host discovery)
 * - recon-ng (modular OSINT framework)
 */

export class OsintStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target, featureConfig = {}) {
    const tools = {};

    if (featureConfig.theHarvester) {
      const run = await this.commandRunner.run('theHarvester', ['-d', target.host, '-b', 'all'], {
        timeout: featureConfig.timeout ?? 60000,
        maxBuffer: 4 * 1024 * 1024
      });
      if (run.ok) {
        tools.theHarvester = {
          status: 'ok'
        };
        if (this.config.storage.persistRawOutput) {
          tools.theHarvester.raw = this._truncateOutput(run.stdout);
        }
      } else {
        tools.theHarvester = {
          status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
          message: run.error?.message || 'theHarvester failed'
        };
      }
    }

    if (featureConfig.reconNg) {
      tools.reconNg = {
        status: 'manual',
        message: 'recon-ng requires interactive scripting; run via custom scripts'
      };
    }

    if (Object.keys(tools).length === 0) {
      return { status: 'skipped' };
    }

    return {
      _individual: tools,
      _aggregated: {
        status: Object.values(tools).some((entry) => entry.status === 'ok') ? 'ok' : 'empty',
        tools
      },
      status: Object.values(tools).some((entry) => entry.status === 'ok') ? 'ok' : 'empty',
      tools
    };
  }

  _truncateOutput(text, maxLength = 10000) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '\n... (truncated)';
  }
}
