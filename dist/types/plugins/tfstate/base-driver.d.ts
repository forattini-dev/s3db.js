export interface StateFileMetadata {
    path: string;
    lastModified: string | Date;
    size?: number;
    etag?: string;
}
/**
 * Base Driver Class for TfState Plugin
 *
 * All tfstate drivers must extend this class and implement the required methods.
 */
export declare class TfStateDriver {
    config: Record<string, any>;
    selector: string;
    constructor(config?: Record<string, any>);
    /**
     * Initialize the driver
     * Called during plugin installation
     */
    initialize(): Promise<void>;
    /**
     * List all state files matching the selector
     * @returns {Promise<Array>} Array of state file metadata { path, lastModified, size }
     */
    listStateFiles(): Promise<StateFileMetadata[]>;
    /**
     * Read a state file content
     * @param {string} path - Path to the state file
     * @returns {Promise<Object>} Parsed state file content
     */
    readStateFile(path: string): Promise<any>;
    /**
     * Get state file metadata
     * @param {string} path - Path to the state file
     * @returns {Promise<Object>} Metadata { path, lastModified, size, etag }
     */
    getStateFileMetadata(path: string): Promise<StateFileMetadata>;
    /**
     * Check if a state file has been modified since last check
     * @param {string} path - Path to the state file
     * @param {Date} since - Check modifications since this date
     * @returns {Promise<boolean>} True if modified
     */
    hasBeenModified(path: string, since: Date): Promise<boolean>;
    /**
     * Match a path against the selector pattern
     * @param {string} path - Path to check
     * @returns {boolean} True if matches
     */
    matchesSelector(path: string): boolean;
    /**
     * Close/cleanup driver resources
     */
    close(): Promise<void>;
}
//# sourceMappingURL=base-driver.d.ts.map