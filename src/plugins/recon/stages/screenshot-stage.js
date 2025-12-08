/**
 * ScreenshotStage
 *
 * Visual reconnaissance stage.
 *
 * NOTE: This functionality is not currently available in RedBlue.
 * This stage returns 'unavailable' status until screenshot support is added.
 */

export class ScreenshotStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target, featureConfig = {}) {
    return {
      status: 'unavailable',
      message: 'Screenshot capture is not available in RedBlue. Use dedicated tools like aquatone or EyeWitness directly.',
      url: this._buildUrl(target)
    };
  }

  _buildUrl(target) {
    const protocol = target.protocol || 'https';
    const port = target.port && target.port !== (protocol === 'http' ? 80 : 443)
      ? `:${target.port}`
      : '';
    return `${protocol}://${target.host}${port}${target.path || ''}`;
  }
}
