/**
 * SecretsStage
 *
 * Secrets detection stage.
 *
 * NOTE: This functionality is not currently available in RedBlue.
 * This stage returns 'unavailable' status until secrets scanning support is added.
 *
 * For secrets detection, use dedicated tools:
 * - Gitleaks (https://github.com/gitleaks/gitleaks)
 * - TruffleHog (https://github.com/trufflesecurity/trufflehog)
 */

export class SecretsStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
  }

  async execute(target, featureConfig = {}) {
    return {
      status: 'unavailable',
      message: 'Secrets scanning is not available in RedBlue. Use dedicated tools like Gitleaks or TruffleHog directly.',
      host: target.host,
      findings: [],
      summary: {
        total: 0,
        highSeverity: 0,
        mediumSeverity: 0,
        lowSeverity: 0
      }
    };
  }
}
