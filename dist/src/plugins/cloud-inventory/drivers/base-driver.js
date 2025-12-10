import { PluginError } from '../../../errors.js';
export class BaseCloudDriver {
    id;
    driver;
    credentials;
    config;
    globals;
    logger;
    constructor(options = { driver: '' }) {
        const { id, driver, credentials = {}, config = {}, globals = {}, logger = null } = options;
        if (!driver) {
            throw new PluginError('Cloud driver requires a "driver" identifier', {
                pluginName: 'CloudInventoryPlugin',
                operation: 'cloudDriver:constructor',
                statusCode: 500,
                retriable: false,
                suggestion: 'Specify the driver key (e.g. "aws", "gcp") when instantiating a cloud inventory driver.'
            });
        }
        this.id = id || driver;
        this.driver = driver;
        this.credentials = credentials;
        this.config = config;
        this.globals = globals;
        this.logger = typeof logger === 'function' ? logger : () => { };
    }
    async initialize() {
        return;
    }
    async *listResources(_options) {
        throw new PluginError(`Driver "${this.driver}" does not implement listResources()`, {
            pluginName: 'CloudInventoryPlugin',
            operation: 'cloudDriver:listResources',
            statusCode: 500,
            retriable: false,
            suggestion: 'Implement listResources(options) in the concrete cloud driver to fetch inventory data.'
        });
    }
    async healthCheck() {
        return { ok: true };
    }
    async destroy() {
        return;
    }
}
export default BaseCloudDriver;
//# sourceMappingURL=base-driver.js.map