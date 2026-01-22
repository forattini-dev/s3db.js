/**
 * S3DB CLI Spinner Component
 *
 * Simple animated spinner for CLI operations using tuiuiu spinner styles
 */

import { cyan, green, red, yellow, gray, bold } from 'tuiuiu.js/colors';

type SpinnerStyle = 'dots' | 'line' | 'arc' | 'circle' | 'bouncingBar' | 'aesthetic' | 'arrow';

interface SpinnerConfig {
  frames: string[];
  interval: number;
}

const SPINNERS: Record<SpinnerStyle, SpinnerConfig> = {
  dots: {
    frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    interval: 80,
  },
  line: {
    frames: ['-', '\\', '|', '/'],
    interval: 130,
  },
  arc: {
    frames: ['◜', '◠', '◝', '◞', '◡', '◟'],
    interval: 100,
  },
  circle: {
    frames: ['◐', '◓', '◑', '◒'],
    interval: 50,
  },
  bouncingBar: {
    frames: [
      '[    ]', '[=   ]', '[==  ]', '[=== ]', '[ ===]',
      '[  ==]', '[   =]', '[    ]', '[   =]', '[  ==]',
      '[ ===]', '[====]', '[=== ]', '[==  ]', '[=   ]',
    ],
    interval: 80,
  },
  aesthetic: {
    frames: ['▰▱▱▱▱▱▱', '▰▰▱▱▱▱▱', '▰▰▰▱▱▱▱', '▰▰▰▰▱▱▱', '▰▰▰▰▰▱▱', '▰▰▰▰▰▰▱', '▰▰▰▰▰▰▰', '▰▱▱▱▱▱▱'],
    interval: 80,
  },
  arrow: {
    frames: ['▹▹▹▹▹', '▸▹▹▹▹', '▹▸▹▹▹', '▹▹▸▹▹', '▹▹▹▸▹', '▹▹▹▹▸'],
    interval: 120,
  },
};

export interface SpinnerOptions {
  text?: string;
  style?: SpinnerStyle;
  color?: (s: string) => string;
}

/**
 * CLI Spinner class for showing loading states
 */
export class Spinner {
  private _text: string;
  private style: SpinnerStyle;
  private color: (s: string) => string;
  private frameIndex: number = 0;
  private timer: NodeJS.Timeout | null = null;
  private stream: NodeJS.WriteStream;
  private isRunning: boolean = false;

  constructor(options: SpinnerOptions | string = {}) {
    if (typeof options === 'string') {
      options = { text: options };
    }

    this._text = options.text || 'Loading...';
    this.style = options.style || 'dots';
    this.color = options.color || cyan;
    this.stream = process.stderr;
  }

  get text(): string {
    return this._text;
  }

  set text(value: string) {
    this._text = value;
    if (this.isRunning) {
      this.render();
    }
  }

  private get config(): SpinnerConfig {
    return SPINNERS[this.style];
  }

  private get frame(): string {
    return this.config.frames[this.frameIndex] ?? this.config.frames[0]!;
  }

  private get isTTY(): boolean {
    return this.stream.isTTY === true;
  }

  private clearLine(): void {
    if (this.isTTY) {
      this.stream.clearLine(0);
      this.stream.cursorTo(0);
    }
  }

  private render(): void {
    if (!this.isTTY) return;
    const frame = this.color(this.frame);
    this.clearLine();
    this.stream.write(`${frame} ${this._text}`);
  }

  start(text?: string): this {
    if (text) this._text = text;
    if (this.isRunning) return this;

    this.isRunning = true;

    if (this.isTTY) {
      this.render();
      this.timer = setInterval(() => {
        this.frameIndex = (this.frameIndex + 1) % this.config.frames.length;
        this.render();
      }, this.config.interval);
    }

    return this;
  }

  stop(): this {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    this.clearLine();
    return this;
  }

  succeed(text?: string): this {
    this.stop();
    const message = text || this._text;
    console.log(`${green('✓')} ${message}`);
    return this;
  }

  fail(text?: string): this {
    this.stop();
    const message = text || this._text;
    console.error(`${red('✗')} ${message}`);
    return this;
  }

  warn(text?: string): this {
    this.stop();
    const message = text || this._text;
    console.log(`${yellow('⚠')} ${message}`);
    return this;
  }

  info(text?: string): this {
    this.stop();
    const message = text || this._text;
    console.log(`${cyan('ℹ')} ${message}`);
    return this;
  }
}

/**
 * Create a new spinner instance
 */
export function createSpinner(options?: SpinnerOptions | string): Spinner {
  return new Spinner(options);
}

/**
 * Convenience function to create and start a spinner
 */
export function spinner(text: string): Spinner {
  return new Spinner({ text }).start();
}
