import { Plugin } from './plugin.class.js';
import tryFn from '../concerns/try-fn.js';
import { PluginError } from '../errors.js';
import { createLogger } from '../concerns/logger.js';
export class GeoPlugin extends Plugin {
    resources;
    base32;
    constructor(options = {}) {
        super(options);
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            const logLevel = this.logLevel || 'info';
            this.logger = createLogger({ name: 'GeoPlugin', level: logLevel });
        }
        const opts = this.options;
        const { resources = {} } = opts;
        this.resources = resources;
        this.base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    }
    async install(database) {
        await super.install(database);
        for (const [resourceName, config] of Object.entries(this.resources)) {
            await this._setupResource(resourceName, config);
        }
        this.database.addHook('afterCreateResource', async (context) => {
            const resource = context.resource;
            const geoConfig = this.resources[resource.name];
            if (geoConfig) {
                await this._setupResource(resource.name, geoConfig);
            }
        });
        this.logger.debug({ resourceCount: Object.keys(this.resources).length }, `Installed with ${Object.keys(this.resources).length} resources`);
        this.emit('db:plugin:installed', {
            plugin: 'GeoPlugin',
            resources: Object.keys(this.resources)
        });
    }
    async _setupResource(resourceName, config) {
        if (!this.database.resources[resourceName]) {
            this.logger.warn({ resourceName }, `Resource "${resourceName}" not found, will setup when created`);
            return;
        }
        const resource = this.database.resources[resourceName];
        if (!resource || typeof resource.addHook !== 'function') {
            this.logger.warn({ resourceName }, `Resource "${resourceName}" not found or invalid`);
            return;
        }
        if (!config.latField || !config.lonField) {
            throw new PluginError(`[GeoPlugin] Resource "${resourceName}" must have "latField" and "lonField" configured`, {
                pluginName: 'GeoPlugin',
                operation: 'setupResource',
                resourceName,
                statusCode: 400,
                retriable: false,
                suggestion: 'Update GeoPlugin configuration with { latField: "...", lonField: "..." } for the resource.'
            });
        }
        if (!config.precision || config.precision < 1 || config.precision > 12) {
            config.precision = 5;
        }
        resource._geoConfig = config;
        const latField = resource.attributes[config.latField];
        const lonField = resource.attributes[config.lonField];
        const isLatOptional = typeof latField === 'object' && latField.optional === true;
        const isLonOptional = typeof lonField === 'object' && lonField.optional === true;
        const areCoordinatesOptional = isLatOptional || isLonOptional;
        const geohashType = areCoordinatesOptional ? 'string|optional' : 'string';
        let needsUpdate = false;
        const newAttributes = { ...resource.attributes };
        if (config.addGeohash && !newAttributes.geohash) {
            newAttributes.geohash = geohashType;
            needsUpdate = true;
        }
        if (!newAttributes._geohash) {
            newAttributes._geohash = geohashType;
            needsUpdate = true;
        }
        if (config.zoomLevels && Array.isArray(config.zoomLevels)) {
            for (const zoom of config.zoomLevels) {
                const fieldName = `_geohash_zoom${zoom}`;
                if (!newAttributes[fieldName]) {
                    newAttributes[fieldName] = geohashType;
                    needsUpdate = true;
                }
            }
        }
        if (needsUpdate) {
            resource.updateAttributes(newAttributes);
            if (this.database.uploadMetadataFile) {
                await this.database.uploadMetadataFile();
            }
        }
        if (config.usePartitions) {
            await this._setupPartitions(resource, config);
        }
        this._addHooks(resource, config);
        this._addHelperMethods(resource, config);
    }
    async _setupPartitions(resource, config) {
        const updatedConfig = { ...resource.config };
        updatedConfig.partitions = updatedConfig.partitions || {};
        let partitionsCreated = 0;
        if (config.zoomLevels && Array.isArray(config.zoomLevels)) {
            for (const zoom of config.zoomLevels) {
                const partitionName = `byGeohashZoom${zoom}`;
                const fieldName = `_geohash_zoom${zoom}`;
                if (!updatedConfig.partitions[partitionName]) {
                    updatedConfig.partitions[partitionName] = {
                        fields: {
                            [fieldName]: 'string'
                        }
                    };
                    partitionsCreated++;
                }
            }
        }
        else {
            const hasGeohashPartition = resource.config.partitions &&
                resource.config.partitions.byGeohash;
            if (!hasGeohashPartition) {
                updatedConfig.partitions.byGeohash = {
                    fields: {
                        _geohash: 'string'
                    }
                };
                partitionsCreated++;
                this.logger.debug({ resourceName: resource.name }, `Created byGeohash partition for "${resource.name}"`);
            }
        }
        if (partitionsCreated > 0) {
            resource.config = updatedConfig;
            resource.setupPartitionHooks();
            if (this.database.uploadMetadataFile) {
                await this.database.uploadMetadataFile();
            }
        }
    }
    _addHooks(resource, config) {
        const calculateGeohash = async (data) => {
            const lat = data[config.latField];
            const lon = data[config.lonField];
            if (lat !== undefined && lon !== undefined) {
                const geohash = this.encodeGeohash(lat, lon, config.precision);
                if (config.addGeohash) {
                    data.geohash = geohash;
                }
                data._geohash = geohash;
                if (config.zoomLevels && Array.isArray(config.zoomLevels)) {
                    for (const zoom of config.zoomLevels) {
                        const zoomGeohash = this.encodeGeohash(lat, lon, zoom);
                        data[`_geohash_zoom${zoom}`] = zoomGeohash;
                    }
                }
            }
            return data;
        };
        resource.addHook('beforeInsert', calculateGeohash);
        resource.addHook('beforeUpdate', calculateGeohash);
    }
    _addHelperMethods(resource, config) {
        const plugin = this;
        resource.findNearby = async function ({ lat, lon, radius = 10, limit = 100 }) {
            if (lat === undefined || lon === undefined) {
                throw new PluginError('Latitude and longitude are required for findNearby()', {
                    pluginName: 'GeoPlugin',
                    operation: 'findNearby',
                    resourceName: resource.name,
                    statusCode: 400,
                    retriable: false,
                    suggestion: 'Call findNearby({ lat, lon, radius }) with both coordinates.'
                });
            }
            const longitude = lon;
            let allRecords = [];
            if (config.usePartitions) {
                let partitionName;
                let fieldName;
                let precision;
                if (config.zoomLevels && config.zoomLevels.length > 0) {
                    const optimalZoom = plugin._selectOptimalZoom(config.zoomLevels, radius);
                    partitionName = `byGeohashZoom${optimalZoom}`;
                    fieldName = `_geohash_zoom${optimalZoom}`;
                    precision = optimalZoom;
                    if (plugin.logLevel === 'debug' || plugin.logLevel === 'trace') {
                        const zoomMsg = `[GeoPlugin] Auto-selected zoom${optimalZoom} (${plugin._getPrecisionDistance(optimalZoom)}km cells) for ${radius}km radius query`;
                        plugin.logger.info(zoomMsg);
                    }
                }
                else {
                    partitionName = 'byGeohash';
                    fieldName = '_geohash';
                    precision = config.precision;
                }
                if (this.config.partitions?.[partitionName]) {
                    const centerGeohash = plugin.encodeGeohash(lat, longitude, precision);
                    const neighbors = plugin.getNeighbors(centerGeohash);
                    const geohashesToSearch = [centerGeohash, ...neighbors];
                    const partitionResults = await Promise.all(geohashesToSearch.map(async (geohash) => {
                        const [ok, , records] = await tryFn(async () => {
                            return await this.listPartition({
                                partition: partitionName,
                                partitionValues: { [fieldName]: geohash },
                                limit: limit * 2
                            });
                        });
                        return ok ? records : [];
                    }));
                    allRecords = partitionResults.flat();
                    if (plugin.logLevel === 'debug' || plugin.logLevel === 'trace') {
                        const msg = `[GeoPlugin] findNearby searched ${geohashesToSearch.length} ${partitionName} partitions, found ${allRecords.length} candidates`;
                        plugin.logger.info(msg);
                    }
                }
                else {
                    allRecords = await this.list({ limit: limit * 10 });
                }
            }
            else {
                allRecords = await this.list({ limit: limit * 10 });
            }
            const withDistances = allRecords
                .map(record => {
                const recordLat = record[config.latField];
                const recordLon = record[config.lonField];
                if (recordLat === undefined || recordLon === undefined) {
                    return null;
                }
                const distance = plugin.calculateDistance(lat, longitude, recordLat, recordLon);
                return {
                    ...record,
                    _distance: distance
                };
            })
                .filter((record) => record !== null && record._distance <= radius)
                .sort((a, b) => a._distance - b._distance)
                .slice(0, limit);
            return withDistances;
        };
        resource.findInBounds = async function ({ north, south, east, west, limit = 100 }) {
            if (north === undefined || south === undefined || east === undefined || west === undefined) {
                throw new PluginError('Bounding box requires north, south, east, west coordinates', {
                    pluginName: 'GeoPlugin',
                    operation: 'findInBounds',
                    resourceName: resource.name,
                    statusCode: 400,
                    retriable: false,
                    suggestion: 'Call findInBounds({ north, south, east, west }) with all four boundaries.'
                });
            }
            let allRecords = [];
            if (config.usePartitions) {
                let partitionName;
                let precision;
                if (config.zoomLevels && config.zoomLevels.length > 0) {
                    const centerLat = (north + south) / 2;
                    const centerLon = (east + west) / 2;
                    const latRadius = plugin.calculateDistance(centerLat, centerLon, north, centerLon);
                    const lonRadius = plugin.calculateDistance(centerLat, centerLon, centerLat, east);
                    const approximateRadius = Math.max(latRadius, lonRadius);
                    const optimalZoom = plugin._selectOptimalZoom(config.zoomLevels, approximateRadius);
                    partitionName = `byGeohashZoom${optimalZoom}`;
                    precision = optimalZoom;
                    if (plugin.logLevel === 'debug' || plugin.logLevel === 'trace') {
                        const zoomMsg = `[GeoPlugin] Auto-selected zoom${optimalZoom} (${plugin._getPrecisionDistance(optimalZoom)}km cells) for ${approximateRadius.toFixed(1)}km bounding box`;
                        plugin.logger.info(zoomMsg);
                    }
                }
                else {
                    partitionName = 'byGeohash';
                    precision = config.precision;
                }
                if (this.config.partitions?.[partitionName]) {
                    const geohashesToSearch = plugin._getGeohashesInBounds({
                        north, south, east, west,
                        precision
                    });
                    const partitionResults = await Promise.all(geohashesToSearch.map(async (geohash) => {
                        const [ok, , records] = await tryFn(async () => {
                            const fieldName = config.zoomLevels ? `_geohash_zoom${precision}` : '_geohash';
                            return await this.listPartition({
                                partition: partitionName,
                                partitionValues: { [fieldName]: geohash },
                                limit: limit * 2
                            });
                        });
                        return ok ? records : [];
                    }));
                    allRecords = partitionResults.flat();
                    if (plugin.logLevel === 'debug' || plugin.logLevel === 'trace') {
                        const msg = `[GeoPlugin] findInBounds searched ${geohashesToSearch.length} ${partitionName} partitions, found ${allRecords.length} candidates`;
                        plugin.logger.info(msg);
                    }
                }
                else {
                    allRecords = await this.list({ limit: limit * 10 });
                }
            }
            else {
                allRecords = await this.list({ limit: limit * 10 });
            }
            const inBounds = allRecords
                .filter(record => {
                const lat = record[config.latField];
                const lon = record[config.lonField];
                if (lat === undefined || lon === undefined) {
                    return false;
                }
                return lat <= north && lat >= south && lon <= east && lon >= west;
            })
                .slice(0, limit);
            return inBounds;
        };
        resource.getDistance = async function (id1, id2) {
            let record1;
            let record2;
            try {
                [record1, record2] = await Promise.all([
                    this.get(id1),
                    this.get(id2)
                ]);
            }
            catch (err) {
                if (err.name === 'NoSuchKey' || err.message?.includes('No such key')) {
                    throw new PluginError('One or both records not found for distance calculation', {
                        pluginName: 'GeoPlugin',
                        operation: 'getDistance',
                        resourceName: resource.name,
                        statusCode: 404,
                        retriable: false,
                        suggestion: 'Ensure both record IDs exist before calling getDistance().',
                        ids: [id1, id2],
                        original: err
                    });
                }
                throw err;
            }
            if (!record1 || !record2) {
                throw new PluginError('One or both records not found for distance calculation', {
                    pluginName: 'GeoPlugin',
                    operation: 'getDistance',
                    resourceName: resource.name,
                    statusCode: 404,
                    retriable: false,
                    suggestion: 'Ensure both record IDs exist before calling getDistance().',
                    ids: [id1, id2]
                });
            }
            const lat1 = record1[config.latField];
            const lon1 = record1[config.lonField];
            const lat2 = record2[config.latField];
            const lon2 = record2[config.lonField];
            if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
                throw new PluginError('One or both records are missing coordinates', {
                    pluginName: 'GeoPlugin',
                    operation: 'getDistance',
                    resourceName: resource.name,
                    statusCode: 422,
                    retriable: false,
                    suggestion: `Check that both records contain ${config.latField} and ${config.lonField} before using geospatial helpers.`,
                    ids: [id1, id2]
                });
            }
            const distance = plugin.calculateDistance(lat1, lon1, lat2, lon2);
            return {
                distance,
                unit: 'km',
                from: id1,
                to: id2
            };
        };
    }
    encodeGeohash(latitude, longitude, precision = 5) {
        let idx = 0;
        let bit = 0;
        let evenBit = true;
        let geohash = '';
        let latMin = -90;
        let latMax = 90;
        let lonMin = -180;
        let lonMax = 180;
        while (geohash.length < precision) {
            if (evenBit) {
                const lonMid = (lonMin + lonMax) / 2;
                if (longitude > lonMid) {
                    idx |= (1 << (4 - bit));
                    lonMin = lonMid;
                }
                else {
                    lonMax = lonMid;
                }
            }
            else {
                const latMid = (latMin + latMax) / 2;
                if (latitude > latMid) {
                    idx |= (1 << (4 - bit));
                    latMin = latMid;
                }
                else {
                    latMax = latMid;
                }
            }
            evenBit = !evenBit;
            if (bit < 4) {
                bit++;
            }
            else {
                geohash += this.base32[idx];
                bit = 0;
                idx = 0;
            }
        }
        return geohash;
    }
    decodeGeohash(geohash) {
        let evenBit = true;
        let latMin = -90;
        let latMax = 90;
        let lonMin = -180;
        let lonMax = 180;
        for (let i = 0; i < geohash.length; i++) {
            const chr = geohash[i];
            const idx = this.base32.indexOf(chr);
            if (idx === -1) {
                throw new PluginError(`Invalid geohash character: ${chr}`, {
                    pluginName: 'GeoPlugin',
                    operation: 'decodeGeohash',
                    statusCode: 400,
                    retriable: false,
                    suggestion: 'Ensure geohash strings use the base32 alphabet 0123456789bcdefghjkmnpqrstuvwxyz.',
                    geohash
                });
            }
            for (let n = 4; n >= 0; n--) {
                const bitN = (idx >> n) & 1;
                if (evenBit) {
                    const lonMid = (lonMin + lonMax) / 2;
                    if (bitN === 1) {
                        lonMin = lonMid;
                    }
                    else {
                        lonMax = lonMid;
                    }
                }
                else {
                    const latMid = (latMin + latMax) / 2;
                    if (bitN === 1) {
                        latMin = latMid;
                    }
                    else {
                        latMax = latMid;
                    }
                }
                evenBit = !evenBit;
            }
        }
        const latitude = (latMin + latMax) / 2;
        const longitude = (lonMin + lonMax) / 2;
        return {
            latitude,
            longitude,
            error: {
                latitude: latMax - latMin,
                longitude: lonMax - lonMin
            }
        };
    }
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this._toRadians(lat2 - lat1);
        const dLon = this._toRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this._toRadians(lat1)) *
                Math.cos(this._toRadians(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    getNeighbors(geohash) {
        const decoded = this.decodeGeohash(geohash);
        const { latitude, longitude, error } = decoded;
        const latStep = error.latitude;
        const lonStep = error.longitude;
        const neighbors = [];
        const directions = [
            [-latStep, -lonStep],
            [-latStep, 0],
            [-latStep, lonStep],
            [0, -lonStep],
            [0, lonStep],
            [latStep, -lonStep],
            [latStep, 0],
            [latStep, lonStep]
        ];
        for (const [latDelta, lonDelta] of directions) {
            const neighborHash = this.encodeGeohash(latitude + latDelta, longitude + lonDelta, geohash.length);
            neighbors.push(neighborHash);
        }
        return neighbors;
    }
    _getGeohashesInBounds({ north, south, east, west, precision }) {
        const geohashes = new Set();
        const cellSize = this._getPrecisionDistance(precision);
        const latStep = cellSize / 111;
        const lonStep = cellSize / (111 * Math.cos(this._toRadians((north + south) / 2)));
        for (let lat = south; lat <= north; lat += latStep) {
            for (let lon = west; lon <= east; lon += lonStep) {
                const geohash = this.encodeGeohash(lat, lon, precision);
                geohashes.add(geohash);
            }
        }
        const corners = [
            [north, west], [north, east],
            [south, west], [south, east],
            [(north + south) / 2, west], [(north + south) / 2, east],
            [north, (east + west) / 2], [south, (east + west) / 2]
        ];
        for (const [lat, lon] of corners) {
            const geohash = this.encodeGeohash(lat, lon, precision);
            geohashes.add(geohash);
        }
        return Array.from(geohashes);
    }
    _toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    _getPrecisionDistance(precision) {
        const distances = {
            1: 5000,
            2: 1250,
            3: 156,
            4: 39,
            5: 4.9,
            6: 1.2,
            7: 0.15,
            8: 0.038,
            9: 0.0047,
            10: 0.0012,
            11: 0.00015,
            12: 0.000037
        };
        return distances[precision] || 5;
    }
    _selectOptimalZoom(zoomLevels, radiusKm) {
        if (!zoomLevels || zoomLevels.length === 0) {
            return null;
        }
        const targetCellSize = radiusKm / 2.5;
        let bestZoom = zoomLevels[0];
        let bestDiff = Math.abs(this._getPrecisionDistance(bestZoom) - targetCellSize);
        for (const zoom of zoomLevels) {
            const cellSize = this._getPrecisionDistance(zoom);
            const diff = Math.abs(cellSize - targetCellSize);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestZoom = zoom;
            }
        }
        return bestZoom ?? null;
    }
    getStats() {
        return {
            resources: Object.keys(this.resources).length,
            configurations: Object.entries(this.resources).map(([name, config]) => ({
                resource: name,
                latField: config.latField,
                lonField: config.lonField,
                precision: config.precision,
                cellSize: `~${this._getPrecisionDistance(config.precision)}km`
            }))
        };
    }
    async uninstall() {
        this.logger.debug('Uninstalled');
        this.emit('db:plugin:uninstalled', {
            plugin: 'GeoPlugin'
        });
        await super.uninstall();
    }
}
//# sourceMappingURL=geo.plugin.js.map