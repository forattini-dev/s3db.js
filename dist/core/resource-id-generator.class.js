import { idGenerator as defaultIdGenerator, createCustomGenerator, getUrlAlphabet } from '../concerns/id.js';
import { createIncrementalIdGenerator } from '../concerns/incremental-sequence.js';
export class ResourceIdGenerator {
    resource;
    idSize;
    _incrementalConfig;
    _asyncIdGenerator;
    _generator;
    constructor(resource, config = {}) {
        this.resource = resource;
        const customIdGenerator = config.idGenerator;
        if (typeof customIdGenerator === 'number' && customIdGenerator > 0) {
            this.idSize = customIdGenerator;
        }
        else if (typeof config.idSize === 'number' && config.idSize > 0) {
            this.idSize = config.idSize;
        }
        else {
            this.idSize = 22;
        }
        this._incrementalConfig = null;
        this._asyncIdGenerator = false;
        this._generator = null;
        this._generator = this._configureGenerator(customIdGenerator, this.idSize);
    }
    _configureGenerator(customIdGenerator, idSize) {
        if (typeof customIdGenerator === 'function') {
            return ((data) => String(customIdGenerator(data)));
        }
        const isIncrementalString = typeof customIdGenerator === 'string' &&
            (customIdGenerator === 'incremental' || customIdGenerator.startsWith('incremental:'));
        const isIncrementalObject = typeof customIdGenerator === 'object' &&
            customIdGenerator !== null &&
            customIdGenerator.type === 'incremental';
        if (isIncrementalString || isIncrementalObject) {
            this._incrementalConfig = customIdGenerator;
            return null;
        }
        if (typeof customIdGenerator === 'number' && customIdGenerator > 0) {
            return createCustomGenerator(getUrlAlphabet(), customIdGenerator);
        }
        if (typeof idSize === 'number' && idSize > 0 && idSize !== 22) {
            return createCustomGenerator(getUrlAlphabet(), idSize);
        }
        return defaultIdGenerator;
    }
    initIncremental() {
        if (!this._incrementalConfig || this._generator !== null) {
            return;
        }
        const incrementalGen = createIncrementalIdGenerator({
            client: this.resource.client,
            resourceName: this.resource.name,
            config: this._incrementalConfig,
            logger: this.resource.logger
        });
        this._generator = incrementalGen;
        this._asyncIdGenerator = true;
    }
    isAsync() {
        return this._asyncIdGenerator === true;
    }
    getGenerator() {
        return this._generator;
    }
    generate(data) {
        if (!this._generator) {
            throw new Error('ID generator not initialized. Call initIncremental() first for incremental generators.');
        }
        return this._generator(data);
    }
    getType(customIdGenerator, idSize) {
        if (typeof customIdGenerator === 'function') {
            return 'custom';
        }
        if (this._incrementalConfig) {
            return 'incremental';
        }
        return 'nanoid';
    }
    async getSequenceValue(fieldName = 'id') {
        if (!this._generator?._sequence) {
            return null;
        }
        return this._generator._sequence.getValue(fieldName);
    }
    async resetSequence(fieldName, value) {
        if (!this._generator?._sequence) {
            this.resource.logger?.warn('resetSequence called on non-incremental resource');
            return false;
        }
        return this._generator._sequence.reset(fieldName, value);
    }
    async listSequences() {
        if (!this._generator?._sequence) {
            return null;
        }
        return this._generator._sequence.list();
    }
    async reserveIdBatch(count = 100) {
        if (!this._generator?._sequence) {
            return null;
        }
        return this._generator._sequence.reserveBatch('id', count);
    }
    getBatchStatus(fieldName = 'id') {
        if (!this._generator?._sequence) {
            return null;
        }
        return this._generator._sequence.getBatchStatus(fieldName);
    }
    releaseBatch(fieldName = 'id') {
        if (this._generator?._sequence) {
            this._generator._sequence.releaseBatch(fieldName);
        }
    }
}
export default ResourceIdGenerator;
//# sourceMappingURL=resource-id-generator.class.js.map