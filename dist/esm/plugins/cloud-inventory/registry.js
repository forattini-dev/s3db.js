import { BaseCloudDriver } from './drivers/base-driver.js';
import { PluginError } from '../../errors.js';
const CLOUD_DRIVER_LAZY_LOADERS = {
    aws: () => import('./drivers/aws-driver.js').then(m => m.AwsInventoryDriver),
    gcp: () => import('./drivers/gcp-driver.js').then(m => m.GcpInventoryDriver),
    vultr: () => import('./drivers/vultr-driver.js').then(m => m.VultrInventoryDriver),
    digitalocean: () => import('./drivers/digitalocean-driver.js').then(m => m.DigitalOceanInventoryDriver),
    oracle: () => import('./drivers/oracle-driver.js').then(m => m.OracleInventoryDriver),
    azure: () => import('./drivers/azure-driver.js').then(m => m.AzureInventoryDriver),
    linode: () => import('./drivers/linode-driver.js').then(m => m.LinodeInventoryDriver),
    hetzner: () => import('./drivers/hetzner-driver.js').then(m => m.HetznerInventoryDriver),
    alibaba: () => import('./drivers/alibaba-driver.js').then(m => m.AlibabaInventoryDriver),
    cloudflare: () => import('./drivers/cloudflare-driver.js').then(m => m.CloudflareInventoryDriver),
    'mongodb-atlas': () => import('./drivers/mongodb-atlas-driver.js').then(m => m.MongoDBAtlasInventoryDriver),
};
const CLOUD_DRIVERS = new Map();
const DRIVER_ALIASES = {
    'do': 'digitalocean',
    'oci': 'oracle',
    'az': 'azure',
    'aliyun': 'alibaba',
    'cf': 'cloudflare',
    'atlas': 'mongodb-atlas',
};
export function registerCloudDriver(name, factory) {
    if (!name || typeof name !== 'string') {
        throw new PluginError('registerCloudDriver: name must be a non-empty string', {
            pluginName: 'CloudInventoryPlugin',
            operation: 'registry:register',
            statusCode: 400,
            retriable: false,
            suggestion: 'Call registerCloudDriver with a string identifier, e.g. registerCloudDriver("aws", factory).'
        });
    }
    if (typeof factory !== 'function') {
        throw new PluginError(`registerCloudDriver("${name}") expects a factory function`, {
            pluginName: 'CloudInventoryPlugin',
            operation: 'registry:register',
            statusCode: 400,
            retriable: false,
            suggestion: 'Pass a factory function that returns an instance of BaseCloudDriver.'
        });
    }
    CLOUD_DRIVERS.set(name, factory);
}
export async function createCloudDriver(name, options) {
    if (CLOUD_DRIVERS.has(name)) {
        const resolvedOptions = {
            driver: name,
            ...(options || {})
        };
        const driver = CLOUD_DRIVERS.get(name)(resolvedOptions);
        if (!(driver instanceof BaseCloudDriver)) {
            throw new PluginError(`Driver "${name}" factory must return an instance of BaseCloudDriver`, {
                pluginName: 'CloudInventoryPlugin',
                operation: 'registry:create',
                statusCode: 500,
                retriable: false,
                suggestion: 'Ensure the factory returns a class extending BaseCloudDriver.'
            });
        }
        return driver;
    }
    const normalizedName = name.toLowerCase();
    const driverName = DRIVER_ALIASES[normalizedName] || normalizedName;
    const loader = CLOUD_DRIVER_LAZY_LOADERS[driverName];
    if (!loader) {
        throw new PluginError(`Cloud driver "${name}" is not registered or available.`, {
            pluginName: 'CloudInventoryPlugin',
            operation: 'registry:create',
            statusCode: 400,
            retriable: false,
            suggestion: `Available drivers: ${Object.keys(CLOUD_DRIVER_LAZY_LOADERS).join(', ')} or custom drivers registered via registerCloudDriver(). Registered custom drivers: ${[...CLOUD_DRIVERS.keys()].join(', ') || 'none'}`
        });
    }
    const DriverClass = await loader();
    const resolvedOptions = {
        driver: driverName,
        ...(options || {})
    };
    const driver = new DriverClass(resolvedOptions);
    if (!(driver instanceof BaseCloudDriver)) {
        throw new PluginError(`Driver "${name}" must extend BaseCloudDriver`, {
            pluginName: 'CloudInventoryPlugin',
            operation: 'registry:create',
            statusCode: 500,
            retriable: false,
            suggestion: 'Ensure the driver class extends BaseCloudDriver.'
        });
    }
    return driver;
}
export function listCloudDrivers() {
    return [...CLOUD_DRIVERS.keys()];
}
export function validateCloudDefinition(cloud) {
    if (!cloud || typeof cloud !== 'object') {
        throw new PluginError('Each cloud configuration must be an object', {
            pluginName: 'CloudInventoryPlugin',
            operation: 'registry:validateDefinition',
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide cloud definitions as objects (e.g. { driver: "aws", credentials: {...} }).'
        });
    }
    const { driver, credentials } = cloud;
    if (!driver || typeof driver !== 'string') {
        throw new PluginError('Cloud configuration requires a "driver" string', {
            pluginName: 'CloudInventoryPlugin',
            operation: 'registry:validateDefinition',
            statusCode: 400,
            retriable: false,
            suggestion: 'Set the driver field to a registered driver name.'
        });
    }
    const normalizedDriver = driver.toLowerCase();
    const resolvedDriver = DRIVER_ALIASES[normalizedDriver] || normalizedDriver;
    const isAvailable = CLOUD_DRIVERS.has(driver) ||
        CLOUD_DRIVERS.has(normalizedDriver) ||
        CLOUD_DRIVER_LAZY_LOADERS[resolvedDriver] ||
        driver === 'noop';
    if (!isAvailable) {
        throw new PluginError(`Cloud driver "${driver}" is not available`, {
            pluginName: 'CloudInventoryPlugin',
            operation: 'registry:validateDefinition',
            statusCode: 400,
            retriable: false,
            suggestion: `Available drivers: ${Object.keys(CLOUD_DRIVER_LAZY_LOADERS).join(', ')}, noop. Or register custom drivers via registerCloudDriver().`
        });
    }
    if (!credentials || typeof credentials !== 'object') {
        throw new PluginError(`Cloud "${driver}" requires a credentials object`, {
            pluginName: 'CloudInventoryPlugin',
            operation: 'registry:validateDefinition',
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide credentials for each cloud entry (e.g. credentials: { token: "..." }).'
        });
    }
}
class NoopDriver extends BaseCloudDriver {
    sampleResources;
    constructor(options) {
        super(options);
        this.sampleResources = options.config?.sampleResources || [];
    }
    async *listResources() {
        for (const resource of this.sampleResources) {
            yield resource;
        }
    }
}
registerCloudDriver('noop', (options) => {
    return new NoopDriver({
        ...options,
        driver: options.driver || 'noop'
    });
});
export { BaseCloudDriver } from './drivers/base-driver.js';
//# sourceMappingURL=registry.js.map