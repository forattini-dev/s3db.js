import { Plugin } from './plugin.class.js';
interface S3Client {
    costs?: CostsData;
    on(event: string, handler: EventHandler): void;
}
type EventHandler = (name: string, response: S3Response, input: S3Input) => void;
interface S3Response {
    httpResponse?: {
        headers?: Record<string, string | number>;
    };
    ContentLength?: number;
}
interface S3Input {
    Body?: string | Buffer | {
        length?: number;
    };
    body?: string | Buffer | {
        length?: number;
    };
}
export interface CostsPluginOptions {
    considerFreeTier?: boolean;
    region?: string;
    logLevel?: string;
}
interface CostsConfig {
    considerFreeTier: boolean;
    region: string;
    logLevel?: string;
}
interface RequestPrices {
    put: number;
    copy: number;
    list: number;
    post: number;
    get: number;
    select: number;
    delete: number;
    head: number;
}
interface RequestCounts {
    put: number;
    post: number;
    copy: number;
    list: number;
    get: number;
    select: number;
    delete: number;
    head: number;
}
interface RequestEvents {
    PutObjectCommand: number;
    GetObjectCommand: number;
    CopyObjectCommand: number;
    HeadObjectCommand: number;
    DeleteObjectCommand: number;
    DeleteObjectsCommand: number;
    ListObjectsV2Command: number;
}
interface RequestsData {
    prices: RequestPrices;
    total: number;
    counts: RequestCounts;
    totalEvents: number;
    events: RequestEvents;
    subtotal: number;
}
interface StorageTier {
    limit: number;
    pricePerGB: number;
}
interface StorageData {
    totalBytes: number;
    totalGB: number;
    tiers: StorageTier[];
    currentTier: number;
    subtotal: number;
}
interface DataTransferTier {
    limit: number;
    pricePerGB: number;
}
interface DataTransferData {
    inBytes: number;
    inGB: number;
    inCost: number;
    outBytes: number;
    outGB: number;
    tiers: DataTransferTier[];
    freeTierGB: number;
    freeTierUsed: number;
    currentTier: number;
    subtotal: number;
}
export interface CostsData {
    total: number;
    requests: RequestsData;
    storage: StorageData;
    dataTransfer: DataTransferData;
}
type CommandName = 'PutObjectCommand' | 'GetObjectCommand' | 'CopyObjectCommand' | 'HeadObjectCommand' | 'DeleteObjectCommand' | 'DeleteObjectsCommand' | 'ListObjectsV2Command';
type MethodName = 'put' | 'get' | 'copy' | 'head' | 'delete' | 'list';
export declare class CostsPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    config: CostsConfig;
    map: Record<CommandName, MethodName>;
    costs: CostsData;
    client: S3Client | null;
    constructor(config?: CostsPluginOptions);
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    addRequest(name: CommandName, method: MethodName | undefined, response?: S3Response, input?: S3Input): void;
    trackStorage(bytes: number): void;
    trackDataTransferIn(bytes: number): void;
    trackDataTransferOut(bytes: number): void;
    calculateStorageCost(storage: StorageData): number;
    calculateDataTransferCost(dataTransfer: DataTransferData): number;
    updateTotal(): void;
}
export {};
//# sourceMappingURL=costs.plugin.d.ts.map