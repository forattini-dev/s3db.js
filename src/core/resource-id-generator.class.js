import { idGenerator as defaultIdGenerator, createCustomGenerator, getUrlAlphabet } from "../concerns/id.js";
import { createIncrementalIdGenerator } from "../concerns/incremental-sequence.js";

/**
 * ResourceIdGenerator handles all ID generation logic for a Resource.
 * Supports sync generators (nanoid), custom functions, and async incremental sequences.
 */
export class ResourceIdGenerator {
    /**
     * Create a new ResourceIdGenerator instance
     * @param {Object} resource - Parent Resource instance
     * @param {Object} config - Configuration options
     * @param {Function|string|Object} [config.idGenerator] - Custom ID generator
     * @param {number} [config.idSize=22] - Size for auto-generated IDs
     */
    constructor(resource, config = {}) {
        this.resource = resource;

        // Determine idSize: if idGenerator is a number, use it as size
        const customIdGenerator = config.idGenerator;
        if (typeof customIdGenerator === 'number' && customIdGenerator > 0) {
            this.idSize = customIdGenerator;
        } else if (typeof config.idSize === 'number' && config.idSize > 0) {
            this.idSize = config.idSize;
        } else {
            this.idSize = 22;
        }

        // Internal state
        this._incrementalConfig = null;
        this._asyncIdGenerator = false;
        this._generator = null;

        // Configure the generator
        this._generator = this._configureGenerator(customIdGenerator, this.idSize);
    }

    /**
     * Configure the ID generator based on provided options
     * @param {Function|string|number|Object} customIdGenerator - Custom ID generator config
     * @param {number} idSize - Size for auto-generated IDs
     * @returns {Function|null} Configured ID generator function (null for incremental, needs init)
     * @private
     */
    _configureGenerator(customIdGenerator, idSize) {
        // If a custom function is provided, wrap it to ensure string output
        if (typeof customIdGenerator === 'function') {
            return () => String(customIdGenerator());
        }

        // Check for incremental type (string or object)
        const isIncrementalString = typeof customIdGenerator === 'string' &&
            (customIdGenerator === 'incremental' || customIdGenerator.startsWith('incremental:'));
        const isIncrementalObject = typeof customIdGenerator === 'object' &&
            customIdGenerator !== null &&
            customIdGenerator.type === 'incremental';

        if (isIncrementalString || isIncrementalObject) {
            // Store config for later initialization (client may not be available yet)
            this._incrementalConfig = customIdGenerator;
            // Return null - will be replaced in initIncremental()
            return null;
        }

        // If customIdGenerator is a number (size), create a generator with that size
        if (typeof customIdGenerator === 'number' && customIdGenerator > 0) {
            return createCustomGenerator(getUrlAlphabet(), customIdGenerator);
        }

        // If idSize is provided, create a generator with that size
        if (typeof idSize === 'number' && idSize > 0 && idSize !== 22) {
            return createCustomGenerator(getUrlAlphabet(), idSize);
        }

        // Default to the standard idGenerator (22 chars)
        return defaultIdGenerator;
    }

    /**
     * Initialize incremental ID generator (called after client is available)
     * Must be called after the Resource has a connected client.
     */
    initIncremental() {
        if (!this._incrementalConfig || this._generator !== null) {
            return;
        }

        this._generator = createIncrementalIdGenerator({
            client: this.resource.client,
            resourceName: this.resource.name,
            config: this._incrementalConfig,
            logger: this.resource.logger
        });

        // Mark as async generator
        this._asyncIdGenerator = true;
    }

    /**
     * Check if ID generator is async (incremental mode)
     * @returns {boolean}
     */
    isAsync() {
        return this._asyncIdGenerator === true;
    }

    /**
     * Get the current generator function
     * @returns {Function|null}
     */
    getGenerator() {
        return this._generator;
    }

    /**
     * Generate a new ID
     * @returns {string|Promise<string>} Generated ID
     */
    generate() {
        if (!this._generator) {
            throw new Error('ID generator not initialized. Call initIncremental() first for incremental generators.');
        }
        return this._generator();
    }

    /**
     * Get a serializable representation of the ID generator type
     * @param {Function|number|string|Object} customIdGenerator - Custom ID generator or config
     * @param {number} idSize - Size for auto-generated IDs
     * @returns {string} Serializable ID generator type ('nanoid', 'custom', 'incremental', etc.)
     */
    getType(customIdGenerator, idSize) {
        // If a custom function is provided
        if (typeof customIdGenerator === 'function') {
            return 'custom';
        }

        // Check for incremental config
        if (this._incrementalConfig) {
            return 'incremental';
        }

        // Default: nanoid-based generator (any size)
        return 'nanoid';
    }

    // =========================================================================
    // SEQUENCE METHODS (for incremental ID generators)
    // =========================================================================

    /**
     * Get the current sequence value without incrementing
     * Only available for resources with incremental ID generator
     * @param {string} [fieldName='id'] - Field name
     * @returns {Promise<number|null>} Current sequence value or null if not incremental
     */
    async getSequenceValue(fieldName = 'id') {
        if (!this._generator?._sequence) {
            return null;
        }
        return this._generator._sequence.getValue(fieldName);
    }

    /**
     * Reset a sequence to a specific value
     * Only available for resources with incremental ID generator
     *
     * WARNING: This can cause ID conflicts if you reset to a value
     * that has already been used. Use with caution.
     *
     * @param {string} fieldName - Field name
     * @param {number} value - New value for the sequence
     * @returns {Promise<boolean>} Success status
     */
    async resetSequence(fieldName, value) {
        if (!this._generator?._sequence) {
            this.resource.logger?.warn('resetSequence called on non-incremental resource');
            return false;
        }
        return this._generator._sequence.reset(fieldName, value);
    }

    /**
     * List all sequences for this resource
     * Only available for resources with incremental ID generator
     * @returns {Promise<Array|null>} Array of sequence info or null if not incremental
     */
    async listSequences() {
        if (!this._generator?._sequence) {
            return null;
        }
        return this._generator._sequence.list();
    }

    /**
     * Reserve a batch of IDs for bulk operations (fast mode only)
     * @param {number} [count=100] - Number of IDs to reserve
     * @returns {Promise<Object|null>} Batch info { start, end, current } or null
     */
    async reserveIdBatch(count = 100) {
        if (!this._generator?._sequence) {
            return null;
        }
        return this._generator._sequence.reserveBatch('id', count);
    }

    /**
     * Get the status of the current local batch (fast mode only)
     * @param {string} [fieldName='id'] - Field name
     * @returns {Object|null} Batch status { start, end, current, remaining } or null
     */
    getBatchStatus(fieldName = 'id') {
        if (!this._generator?._sequence) {
            return null;
        }
        return this._generator._sequence.getBatchStatus(fieldName);
    }

    /**
     * Release unused IDs in the current batch (for graceful shutdown)
     * @param {string} [fieldName='id'] - Field name
     */
    releaseBatch(fieldName = 'id') {
        if (this._generator?._sequence) {
            this._generator._sequence.releaseBatch(fieldName);
        }
    }
}
