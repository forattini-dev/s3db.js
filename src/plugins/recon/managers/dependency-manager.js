/**
 * DependencyManager
 *
 * Validates RedBlue (rb) availability:
 * - Single binary check (replaces ~30 individual tools)
 * - Provides installation guidance
 * - Emits warnings if rb is not found
 */

export class DependencyManager {
  constructor(plugin) {
    this.plugin = plugin;
  }

  /**
   * Check if RedBlue is available
   */
  async checkAll() {
    const warnings = [];
    const runner = this.plugin.commandRunner;
    const isAvailable = await runner.isRedBlueAvailable();

    if (!isAvailable) {
      const warning = {
        tool: 'rb',
        message: 'RedBlue (rb) not found in PATH. All reconnaissance features require RedBlue.',
        installGuide: this._getInstallGuide()
      };

      warnings.push(warning);

      this.plugin.emit('recon:dependency-missing', warning);
    }

    this.plugin.emit('recon:dependencies-checked', {
      available: isAvailable ? 1 : 0,
      missing: isAvailable ? 0 : 1,
      availableTools: isAvailable ? ['rb'] : [],
      missingTools: isAvailable ? [] : ['rb'],
      warnings
    });

    return warnings;
  }

  /**
   * Check if RedBlue is available
   */
  async checkTool(toolName) {
    if (toolName === 'rb' || toolName === 'redblue') {
      return await this.plugin.commandRunner.isRedBlueAvailable();
    }
    return false;
  }

  /**
   * Get tool status
   */
  async getToolStatus() {
    const isAvailable = await this.plugin.commandRunner.isRedBlueAvailable();
    return {
      rb: {
        available: isAvailable,
        required: true,
        description: 'RedBlue - All-in-one security reconnaissance tool'
      }
    };
  }

  _getInstallGuide() {
    return `RedBlue Installation:

  Option 1 - Cargo (Rust):
    cargo install redblue

  Option 2 - Download binary:
    Visit https://github.com/user/redblue/releases
    Download the binary for your platform
    Move to ~/.local/bin/ or /usr/local/bin/

  Option 3 - Build from source:
    git clone https://github.com/user/redblue.git
    cd redblue
    cargo build --release
    cp target/release/rb ~/.local/bin/

  Verify installation:
    rb --version`;
  }
}
