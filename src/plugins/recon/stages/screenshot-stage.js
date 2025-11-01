/**
 * ScreenshotStage
 *
 * Visual reconnaissance:
 * - aquatone (screenshot capture with clustering)
 * - EyeWitness (screenshot + report generation)
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

export class ScreenshotStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target, featureConfig = {}) {
    if (!featureConfig.aquatone && !featureConfig.eyewitness) {
      return { status: 'skipped' };
    }

    const screenshots = {};
    const hostsFile = await this._writeTempHostsFile([this._buildUrl(target)]);

    const executeCapture = async (name, command, args) => {
      const run = await this.commandRunner.run(command, args, {
        timeout: featureConfig.timeout ?? 60000,
        maxBuffer: 4 * 1024 * 1024
      });
      if (!run.ok) {
        screenshots[name] = {
          status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
          message: run.error?.message || `${command} failed`
        };
        return;
      }
      screenshots[name] = { status: 'ok' };
    };

    if (featureConfig.aquatone) {
      const outputDir = featureConfig.outputDir || path.join(os.tmpdir(), `aquatone-${randomUUID()}`);
      await fs.mkdir(outputDir, { recursive: true });
      await executeCapture('aquatone', 'aquatone', ['-scan-timeout', '20000', '-out', outputDir, '-list', hostsFile]);
      screenshots.aquatone.outputDir = outputDir;
    }

    if (featureConfig.eyewitness) {
      const outputDir = featureConfig.outputDir || path.join(os.tmpdir(), `eyewitness-${randomUUID()}`);
      await fs.mkdir(outputDir, { recursive: true });
      await executeCapture('eyewitness', 'EyeWitness', ['--web', '--timeout', '20', '--threads', '5', '--headless', '-f', hostsFile, '-d', outputDir]);
      screenshots.eyewitness = { status: 'ok', outputDir };
    }

    await fs.rm(hostsFile, { force: true });

    if (Object.values(screenshots).some((entry) => entry.status === 'ok')) {
      return {
        _individual: screenshots,
        _aggregated: {
          status: 'ok',
          tools: screenshots
        },
        status: 'ok',
        tools: screenshots
      };
    }

    return {
      _individual: screenshots,
      _aggregated: {
        status: 'empty',
        tools: screenshots
      },
      status: 'empty',
      tools: screenshots
    };
  }

  async _writeTempHostsFile(hosts) {
    const filePath = path.join(os.tmpdir(), `recon-plugin-${randomUUID()}.txt`);
    await fs.writeFile(filePath, hosts.join('\n'), { encoding: 'utf8' });
    return filePath;
  }

  _buildUrl(target) {
    const protocol = target.protocol || 'https';
    const port = target.port && target.port !== (protocol === 'http' ? 80 : 443) ? `:${target.port}` : '';
    return `${protocol}://${target.host}${port}${target.path || ''}`;
  }
}
