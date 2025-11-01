/**
 * DependencyManager
 *
 * Validates tool availability and emits warnings:
 * - Checks if reconnaissance tools are installed
 * - Provides installation guidance
 * - Emits detailed warnings for missing tools
 */

export class DependencyManager {
  constructor(plugin) {
    this.plugin = plugin;
  }

  /**
   * Check all dependencies based on enabled features
   */
  async checkAll() {
    const features = this.plugin.config.features;
    const warnings = [];
    const available = {};
    const missing = {};

    const toolMap = {
      'whois': 'whois',
      'secrets.gitleaks': 'gitleaks',
      'latency.ping': 'ping',
      'latency.traceroute': ['mtr', 'traceroute'],
      'http.curl': 'curl',
      'ports.nmap': 'nmap',
      'ports.masscan': 'masscan',
      'subdomains.amass': 'amass',
      'subdomains.subfinder': 'subfinder',
      'subdomains.assetfinder': 'assetfinder',
      'web.ffuf': 'ffuf',
      'web.feroxbuster': 'feroxbuster',
      'web.gobuster': 'gobuster',
      'vulnerability.nikto': 'nikto',
      'vulnerability.wpscan': 'wpscan',
      'vulnerability.droopescan': 'droopescan',
      'tlsAudit.openssl': 'openssl',
      'tlsAudit.sslyze': 'sslyze',
      'tlsAudit.testssl': 'testssl.sh',
      'fingerprint.whatweb': 'whatweb',
      'screenshots.aquatone': 'aquatone',
      'screenshots.eyewitness': 'EyeWitness',
      'osint.theHarvester': 'theHarvester',
      'osint.sherlock': 'sherlock',
      'osint.maigret': 'maigret'
    };

    for (const [featurePath, commands] of Object.entries(toolMap)) {
      const isEnabled = this._isFeatureEnabled(features, featurePath);
      if (!isEnabled) {
        continue;
      }

      const commandList = Array.isArray(commands) ? commands : [commands];
      let foundAny = false;

      for (const cmd of commandList) {
        const isAvailable = await this._checkTool(cmd);
        if (isAvailable) {
          foundAny = true;
          available[cmd] = true;
          break;
        }
      }

      if (!foundAny) {
        const toolNames = commandList.join(' ou ');
        warnings.push({
          feature: featurePath,
          tools: commandList,
          message: `Ferramenta "${toolNames}" não encontrada no PATH`,
          installGuide: this._getInstallGuide(commandList[0])
        });

        for (const cmd of commandList) {
          missing[cmd] = true;
        }

        this.plugin.emit('recon:dependency-missing', {
          feature: featurePath,
          tools: commandList,
          message: `Ferramenta "${toolNames}" não encontrada no PATH`,
          installGuide: this._getInstallGuide(commandList[0])
        });
      }
    }

    const availableTools = Object.keys(available);
    const missingTools = Object.keys(missing);

    this.plugin.emit('recon:dependencies-checked', {
      available: availableTools.length,
      missing: missingTools.length,
      availableTools,
      missingTools,
      warnings
    });

    return warnings;
  }

  /**
   * Check if a specific tool is available
   */
  async checkTool(toolName) {
    return await this._checkTool(toolName);
  }

  // ========================================
  // Private Helper Methods
  // ========================================

  async _checkTool(command) {
    const runner = this.plugin.commandRunner;
    return await runner.isAvailable(command);
  }

  _isFeatureEnabled(features, path) {
    const parts = path.split('.');
    let current = features;

    for (const part of parts) {
      if (current == null || typeof current !== 'object') {
        return false;
      }
      current = current[part];
    }

    return current === true || (typeof current === 'object' && current !== null);
  }

  _getInstallGuide(toolName) {
    const guides = {
      whois: 'Ubuntu: apt-get install whois | macOS: brew install whois',
      gitleaks: 'https://github.com/gitleaks/gitleaks | go install github.com/gitleaks/gitleaks/v8@latest | brew install gitleaks',
      ping: 'Geralmente pré-instalado. No Ubuntu: apt-get install iputils-ping',
      mtr: 'Ubuntu: apt-get install mtr-tiny | macOS: brew install mtr',
      traceroute: 'Ubuntu: apt-get install traceroute | macOS: Pré-instalado',
      curl: 'Ubuntu: apt-get install curl | macOS: Pré-instalado',
      nmap: 'Ubuntu: apt-get install nmap | macOS: brew install nmap',
      masscan: 'Ubuntu: apt-get install masscan | macOS: brew install masscan',
      amass: 'https://github.com/owasp-amass/amass | Ubuntu: apt install amass | macOS: brew install amass',
      subfinder: 'https://github.com/projectdiscovery/subfinder | go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest',
      assetfinder: 'https://github.com/tomnomnom/assetfinder | go install github.com/tomnomnom/assetfinder@latest',
      ffuf: 'https://github.com/ffuf/ffuf | go install github.com/ffuf/ffuf/v2@latest',
      feroxbuster: 'https://github.com/epi052/feroxbuster | Ubuntu: apt install feroxbuster | macOS: brew install feroxbuster',
      gobuster: 'https://github.com/OJ/gobuster | go install github.com/OJ/gobuster/v3@latest',
      nikto: 'Ubuntu: apt-get install nikto | macOS: brew install nikto',
      wpscan: 'https://github.com/wpscanteam/wpscan | gem install wpscan',
      droopescan: 'https://github.com/SamJoan/droopescan | pip install droopescan',
      openssl: 'Ubuntu: apt-get install openssl | macOS: Pré-instalado',
      sslyze: 'https://github.com/nabla-c0d3/sslyze | pip install sslyze',
      'testssl.sh': 'https://github.com/drwetter/testssl.sh | git clone --depth 1 https://github.com/drwetter/testssl.sh.git',
      whatweb: 'https://github.com/urbanadventurer/WhatWeb | Ubuntu: apt-get install whatweb | macOS: brew install whatweb',
      aquatone: 'https://github.com/michenriksen/aquatone | Download binário do GitHub Releases',
      EyeWitness: 'https://github.com/FortyNorthSecurity/EyeWitness | git clone e seguir instruções',
      theHarvester: 'https://github.com/laramies/theHarvester | pip install theHarvester',
      sherlock: 'https://github.com/sherlock-project/sherlock | pip install sherlock-project',
      maigret: 'https://github.com/soxoj/maigret | pip install maigret'
    };

    return guides[toolName] || `Consulte a documentação oficial da ferramenta "${toolName}" para instruções de instalação.`;
  }
}
