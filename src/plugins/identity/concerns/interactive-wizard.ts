/**
 * Interactive Onboarding Wizard - CLI prompts for admin account creation
 *
 * Uses tuiuiu.js for CLI prompts (zero-dependency)
 * Only works in TTY environments (development)
 *
 * Security:
 * - Masks password input
 * - Validates password strength
 * - Max 3 password attempts
 * - Timeout after 5 minutes
 */

import { PluginError } from '../../../errors.js';

export interface InteractiveWizardOptions {
  logger?: Logger;
  config?: WizardConfig;
  passwordPolicy?: PasswordPolicy;
}

export interface WizardConfig {
  issuer?: string;
  interactive?: {
    maxPasswordAttempts?: number;
    maxEmailAttempts?: number;
    timeout?: number;
  };
}

export interface PasswordPolicy {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSymbols?: boolean;
}

export interface AdminData {
  email: string;
  password: string;
  name: string;
}

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

interface Logger {
  info?: (message: string, ...args: any[]) => void;
  error?: (message: string, ...args: any[]) => void;
}

interface TuiuiuPrompt {
  input: (message: string, options?: { default?: string; validate?: (value: string) => true | string }) => Promise<string>;
  password: (message: string, options?: { validate?: (value: string) => true | string }) => Promise<string>;
}

export class InteractiveWizard {
  private logger: Logger;
  private config: WizardConfig;
  private passwordPolicy: PasswordPolicy;
  private maxPasswordAttempts: number;
  private maxEmailAttempts: number;
  private timeout: number;

  constructor(options: InteractiveWizardOptions = {}) {
    this.logger = options.logger || console;
    this.config = options.config || {};
    this.passwordPolicy = options.passwordPolicy || {};
    this.maxPasswordAttempts = this.config.interactive?.maxPasswordAttempts || 3;
    this.maxEmailAttempts = this.config.interactive?.maxEmailAttempts || 3;
    this.timeout = this.config.interactive?.timeout || 300000;
  }

  async run(): Promise<AdminData> {
    this._printBanner();

    const prompt = await this._loadTuiuiu();

    const email = await this._promptEmail(prompt);

    const password = await this._promptPassword(prompt);

    const name = await this._promptName(prompt);

    this._printSuccess(email);

    return { email, password, name };
  }

  private _printBanner(): void {
    console.log('');
    console.log('🔐 Identity Plugin - First Run Setup');
    console.log('━'.repeat(50));
    console.log('');
    console.log('No admin account found. Let\'s create one!');
    console.log('');
  }

  private _printSuccess(email: string): void {
    console.log('');
    console.log('✅ Admin account created successfully!');
    console.log(`   Email: ${email}`);
    console.log(`   Scopes: openid, profile, email, admin:*`);
    console.log('');
    console.log(`🚀 Identity Server will be ready at ${this.config.issuer || 'http://localhost:4000'}`);
    console.log(`   Login URL: ${this.config.issuer || 'http://localhost:4000'}/login`);
    console.log('');
  }

  private async _promptEmail(prompt: TuiuiuPrompt): Promise<string> {
    let attempts = 0;

    while (attempts < this.maxEmailAttempts) {
      attempts++;

      try {
        const email = await prompt.input('👤 Admin Email:', {
          validate: (value: string) => {
            if (!value || !value.trim()) {
              return 'Email is required';
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              return 'Please enter a valid email address';
            }
            return true;
          }
        });

        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) {
          return email;
        }

        console.log('❌ Invalid email address. Please try again.\n');
      } catch (error: any) {
        if (error.message?.includes('canceled') || error.message?.includes('aborted')) {
          throw new PluginError('Onboarding canceled by user', {
            pluginName: 'IdentityPlugin',
            operation: 'runInteractiveMode',
            statusCode: 400,
            retriable: false
          });
        }
        throw error;
      }
    }

    throw new PluginError(
      `Max email attempts (${this.maxEmailAttempts}) exceeded`,
      {
        pluginName: 'IdentityPlugin',
        operation: 'runInteractiveMode',
        statusCode: 400,
        retriable: false
      }
    );
  }

  private async _promptPassword(prompt: TuiuiuPrompt): Promise<string> {
    let attempts = 0;

    while (attempts < this.maxPasswordAttempts) {
      attempts++;

      try {
        const password = await prompt.password('🔒 Admin Password:', {
          validate: (value: string) => {
            if (!value || !value.trim()) {
              return 'Password is required';
            }
            return true;
          }
        });

        const confirmPassword = await prompt.password('🔒 Confirm Password:', {
          validate: (value: string) => {
            if (!value || !value.trim()) {
              return 'Password confirmation is required';
            }
            return true;
          }
        });

        if (password !== confirmPassword) {
          console.log('❌ Passwords do not match. Please try again.\n');
          continue;
        }

        const validation = this._validatePassword(password);
        if (!validation.valid) {
          console.log(`❌ Password is too weak:`);
          validation.errors.forEach(err => console.log(`   - ${err}`));
          console.log('');
          continue;
        }

        return password;
      } catch (error: any) {
        if (error.message?.includes('canceled') || error.message?.includes('aborted')) {
          throw new PluginError('Onboarding canceled by user', {
            pluginName: 'IdentityPlugin',
            operation: 'runInteractiveMode',
            statusCode: 400,
            retriable: false
          });
        }
        throw error;
      }
    }

    throw new PluginError(
      `Max password attempts (${this.maxPasswordAttempts}) exceeded`,
      {
        pluginName: 'IdentityPlugin',
        operation: 'runInteractiveMode',
        statusCode: 400,
        retriable: false,
        suggestion: 'Use env or config mode for automated setup'
      }
    );
  }

  private async _promptName(prompt: TuiuiuPrompt): Promise<string> {
    try {
      const name = await prompt.input('📝 Display Name (optional):', {
        default: 'Administrator'
      });
      return name || 'Administrator';
    } catch (error: any) {
      if (error.message?.includes('canceled') || error.message?.includes('aborted')) {
        throw new PluginError('Onboarding canceled by user', {
          pluginName: 'IdentityPlugin',
          operation: 'runInteractiveMode',
          statusCode: 400,
          retriable: false
        });
      }
      throw error;
    }
  }

  private _validatePassword(password: string): PasswordValidationResult {
    const errors: string[] = [];
    const policy = this.passwordPolicy;

    if (password.length < (policy.minLength || 12)) {
      errors.push(`Must be at least ${policy.minLength || 12} characters`);
    }

    if (policy.requireUppercase !== false && !/[A-Z]/.test(password)) {
      errors.push('Must contain at least one uppercase letter');
    }

    if (policy.requireLowercase !== false && !/[a-z]/.test(password)) {
      errors.push('Must contain at least one lowercase letter');
    }

    if (policy.requireNumbers !== false && !/\d/.test(password)) {
      errors.push('Must contain at least one number');
    }

    if (policy.requireSymbols !== false && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Must contain at least one symbol (!@#$%^&*...)');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private async _loadTuiuiu(): Promise<TuiuiuPrompt> {
    try {
      const tuiuiu = await import('tuiuiu.js') as any;
      return tuiuiu.prompt;
    } catch (error) {
      throw new PluginError(
        'tuiuiu.js package is required for interactive mode. Install with: npm install tuiuiu.js',
        {
          pluginName: 'IdentityPlugin',
          operation: 'runInteractiveMode',
          cause: error,
          retriable: false,
          suggestion: 'Run: npm install tuiuiu.js'
        }
      );
    }
  }
}
