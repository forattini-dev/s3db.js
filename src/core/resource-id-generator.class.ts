import { idGenerator as defaultIdGenerator, createCustomGenerator, getUrlAlphabet } from '../concerns/id.js';
import { createIncrementalIdGenerator, IncrementalIdGenerator, IncrementalSequence } from '../concerns/incremental-sequence.js';
import type { Client } from '../clients/types.js';
import type { Logger } from '../concerns/logger.js';
import type { IncrementalConfig as SequenceIncrementalConfig, CreateIncrementalIdGeneratorOptions } from '../concerns/incremental-sequence.js';

export interface Resource {
  name: string;
  client: Client;
  logger?: Logger;
}

export interface IncrementalConfig {
  type: 'incremental';
  start?: number;
  prefix?: string;
  mode?: 'fast' | 'normal';
  [key: string]: unknown;
}

export type IdGeneratorConfig = ((data?: unknown) => string) | number | string | IncrementalConfig;

export interface ResourceIdGeneratorConfig {
  idGenerator?: IdGeneratorConfig;
  idSize?: number;
}

export interface SequenceInterface {
  getValue(fieldName: string): Promise<number>;
  reset(fieldName: string, value: number): Promise<boolean>;
  list(): Promise<SequenceInfo[]>;
  reserveBatch(fieldName: string, count: number): Promise<BatchInfo>;
  getBatchStatus(fieldName: string): BatchStatus | null;
  releaseBatch(fieldName: string): void;
}

export interface SequenceInfo {
  fieldName: string;
  currentValue: number;
}

export interface BatchInfo {
  start: number;
  end: number;
  current: number;
}

export interface BatchStatus {
  start: number;
  end: number;
  current: number;
  remaining: number;
  [key: string]: unknown;
}

export type IdGeneratorFunction = ((data?: unknown) => string) | ((data?: unknown) => Promise<string>);

export type IncrementalGenerator = IdGeneratorFunction & {
  _sequence?: SequenceInterface;
};

export class ResourceIdGenerator {
  resource: Resource;
  idSize: number;
  private _incrementalConfig: string | IncrementalConfig | null;
  private _asyncIdGenerator: boolean;
  private _generator: IncrementalGenerator | null;

  constructor(resource: Resource, config: ResourceIdGeneratorConfig = {}) {
    this.resource = resource;

    const customIdGenerator = config.idGenerator;
    if (typeof customIdGenerator === 'number' && customIdGenerator > 0) {
      this.idSize = customIdGenerator;
    } else if (typeof config.idSize === 'number' && config.idSize > 0) {
      this.idSize = config.idSize;
    } else {
      this.idSize = 22;
    }

    this._incrementalConfig = null;
    this._asyncIdGenerator = false;
    this._generator = null;

    this._generator = this._configureGenerator(customIdGenerator, this.idSize);
  }

  private _configureGenerator(
    customIdGenerator: IdGeneratorConfig | undefined,
    idSize: number
  ): IncrementalGenerator | null {
    if (typeof customIdGenerator === 'function') {
      return ((data?: unknown) => String(customIdGenerator(data))) as IncrementalGenerator;
    }

    const isIncrementalString = typeof customIdGenerator === 'string' &&
      (customIdGenerator === 'incremental' || customIdGenerator.startsWith('incremental:'));
    const isIncrementalObject = typeof customIdGenerator === 'object' &&
      customIdGenerator !== null &&
      customIdGenerator.type === 'incremental';

    if (isIncrementalString || isIncrementalObject) {
      this._incrementalConfig = customIdGenerator as string | IncrementalConfig;
      return null;
    }

    if (typeof customIdGenerator === 'number' && customIdGenerator > 0) {
      return createCustomGenerator(getUrlAlphabet(), customIdGenerator) as IncrementalGenerator;
    }

    if (typeof idSize === 'number' && idSize > 0 && idSize !== 22) {
      return createCustomGenerator(getUrlAlphabet(), idSize) as IncrementalGenerator;
    }

    return defaultIdGenerator as IncrementalGenerator;
  }

  initIncremental(): void {
    if (!this._incrementalConfig || this._generator !== null) {
      return;
    }

    const incrementalGen = createIncrementalIdGenerator({
      client: this.resource.client as unknown as CreateIncrementalIdGeneratorOptions['client'],
      resourceName: this.resource.name,
      config: this._incrementalConfig as string | Partial<SequenceIncrementalConfig>,
      logger: this.resource.logger as CreateIncrementalIdGeneratorOptions['logger']
    });

    this._generator = incrementalGen as unknown as IncrementalGenerator;
    this._asyncIdGenerator = true;
  }

  isAsync(): boolean {
    return this._asyncIdGenerator === true;
  }

  getGenerator(): IncrementalGenerator | null {
    return this._generator;
  }

  generate(data?: unknown): string | Promise<string> {
    if (!this._generator) {
      throw new Error('ID generator not initialized. Call initIncremental() first for incremental generators.');
    }
    return this._generator(data);
  }

  getType(customIdGenerator?: IdGeneratorConfig, idSize?: number): string {
    if (typeof customIdGenerator === 'function') {
      return 'custom';
    }

    if (this._incrementalConfig) {
      return 'incremental';
    }

    return 'default';
  }

  async getSequenceValue(fieldName: string = 'id'): Promise<number | null> {
    if (!this._generator?._sequence) {
      return null;
    }
    return this._generator._sequence.getValue(fieldName);
  }

  async resetSequence(fieldName: string, value: number): Promise<boolean> {
    if (!this._generator?._sequence) {
      this.resource.logger?.warn('resetSequence called on non-incremental resource');
      return false;
    }
    return this._generator._sequence.reset(fieldName, value);
  }

  async listSequences(): Promise<SequenceInfo[] | null> {
    if (!this._generator?._sequence) {
      return null;
    }
    return this._generator._sequence.list();
  }

  async reserveIdBatch(count: number = 100): Promise<BatchInfo | null> {
    if (!this._generator?._sequence) {
      return null;
    }
    return this._generator._sequence.reserveBatch('id', count);
  }

  getBatchStatus(fieldName: string = 'id'): BatchStatus | null {
    if (!this._generator?._sequence) {
      return null;
    }
    return this._generator._sequence.getBatchStatus(fieldName);
  }

  releaseBatch(fieldName: string = 'id'): void {
    if (this._generator?._sequence) {
      this._generator._sequence.releaseBatch(fieldName);
    }
  }
}

export default ResourceIdGenerator;
