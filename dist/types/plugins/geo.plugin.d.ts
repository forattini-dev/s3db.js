import { Plugin } from './plugin.class.js';
interface Logger {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
}
interface Resource {
    name: string;
    attributes: Record<string, string | AttributeDefinition>;
    config: ResourceConfig;
    _geoConfig?: GeoResourceConfig;
    addHook(event: string, handler: (data: Record<string, unknown>) => Promise<Record<string, unknown>>): void;
    updateAttributes(attributes: Record<string, string | AttributeDefinition>): void;
    setupPartitionHooks(): void;
    get(id: string): Promise<Record<string, unknown> | null>;
    list(options?: ListOptions): Promise<Record<string, unknown>[]>;
    listPartition(options: ListPartitionOptions): Promise<Record<string, unknown>[]>;
    findNearby?(options: FindNearbyOptions): Promise<Array<Record<string, unknown> & {
        _distance: number;
    }>>;
    findInBounds?(options: FindInBoundsOptions): Promise<Record<string, unknown>[]>;
    getDistance?(id1: string, id2: string): Promise<DistanceResult>;
}
interface AttributeDefinition {
    type?: string;
    optional?: boolean;
    [key: string]: unknown;
}
interface ResourceConfig {
    partitions?: Record<string, PartitionConfig>;
    [key: string]: unknown;
}
interface PartitionConfig {
    fields: Record<string, string>;
}
interface ListOptions {
    limit?: number;
}
interface ListPartitionOptions {
    partition: string;
    partitionValues: Record<string, string>;
    limit?: number;
}
interface FindNearbyOptions {
    lat: number;
    lon: number;
    radius?: number;
    limit?: number;
}
interface FindInBoundsOptions {
    north: number;
    south: number;
    east: number;
    west: number;
    limit?: number;
}
interface DistanceResult {
    distance: number;
    unit: string;
    from: string;
    to: string;
}
interface GeohashDecodeResult {
    latitude: number;
    longitude: number;
    error: {
        latitude: number;
        longitude: number;
    };
}
interface GeoResourceConfig {
    latField: string;
    lonField: string;
    precision: number;
    addGeohash?: boolean;
    usePartitions?: boolean;
    zoomLevels?: number[];
}
export interface GeoPluginOptions {
    resources?: Record<string, GeoResourceConfig>;
    logger?: Logger;
    logLevel?: string;
}
interface GeoStats {
    resources: number;
    configurations: Array<{
        resource: string;
        latField: string;
        lonField: string;
        precision: number;
        cellSize: string;
    }>;
}
interface GetGeohashesInBoundsOptions {
    north: number;
    south: number;
    east: number;
    west: number;
    precision: number;
}
export declare class GeoPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    resources: Record<string, GeoResourceConfig>;
    base32: string;
    constructor(options?: GeoPluginOptions);
    install(database: import('../database.class.js').Database): Promise<void>;
    _setupResource(resourceName: string, config: GeoResourceConfig): Promise<void>;
    _setupPartitions(resource: Resource, config: GeoResourceConfig): Promise<void>;
    _addHooks(resource: Resource, config: GeoResourceConfig): void;
    _addHelperMethods(resource: Resource, config: GeoResourceConfig): void;
    encodeGeohash(latitude: number, longitude: number, precision?: number): string;
    decodeGeohash(geohash: string): GeohashDecodeResult;
    calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number;
    getNeighbors(geohash: string): string[];
    _getGeohashesInBounds({ north, south, east, west, precision }: GetGeohashesInBoundsOptions): string[];
    _toRadians(degrees: number): number;
    _getPrecisionDistance(precision: number): number;
    _selectOptimalZoom(zoomLevels: number[], radiusKm: number): number | null;
    getStats(): GeoStats;
    uninstall(): Promise<void>;
}
export {};
//# sourceMappingURL=geo.plugin.d.ts.map