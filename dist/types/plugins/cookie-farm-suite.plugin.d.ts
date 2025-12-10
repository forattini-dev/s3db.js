import { Plugin } from "./plugin.class.js";
import { PuppeteerPlugin } from "./puppeteer.plugin.js";
import { CookieFarmPlugin } from "./cookie-farm.plugin.js";
import { S3QueuePlugin } from "./s3-queue.plugin.js";
import { TTLPlugin } from "./ttl.plugin.js";
export interface CookieFarmSuitePluginOptions {
    namespace?: string;
    jobsResource?: string;
    resources?: {
        jobs?: string;
        [key: string]: unknown;
    };
    queue?: {
        resource?: string;
        deadLetterResource?: string | null;
        visibilityTimeout?: number;
        pollInterval?: number;
        maxAttempts?: number;
        concurrency?: number;
        autoStart?: boolean;
        onMessage?: Function;
        logLevel?: string;
    };
    puppeteer?: any;
    cookieFarm?: any;
    ttl?: any;
    processor?: Function;
    pluginFactories?: {
        puppeteer?: (options: any) => PuppeteerPlugin;
        cookieFarm?: (options: any) => CookieFarmPlugin;
        queue?: (options: any) => S3QueuePlugin;
        ttl?: (options: any) => TTLPlugin;
    };
}
export interface PersonaJob {
    id: string;
    jobType: string;
    payload?: any;
    priority?: number;
    requestedBy?: string;
    metadata?: any;
    createdAt: string;
}
/**
 * CookieFarmSuitePlugin
 *
 * Bundles CookieFarm + Puppeteer + S3Queue (+ optional TTL) with shared
 * namespace handling for persona farming workloads.
 */
export declare class CookieFarmSuitePlugin extends Plugin {
    namespace: string;
    config: Required<Omit<CookieFarmSuitePluginOptions, 'pluginFactories'>>;
    pluginFactories: Required<NonNullable<CookieFarmSuitePluginOptions['pluginFactories']>>;
    dependencies: {
        name: string;
        instance: Plugin;
    }[];
    jobsResource: any | null;
    puppeteerPlugin: PuppeteerPlugin | null;
    cookieFarmPlugin: CookieFarmPlugin | null;
    queuePlugin: S3QueuePlugin | null;
    ttlPlugin: TTLPlugin | null;
    processor: Function | null;
    constructor(options?: CookieFarmSuitePluginOptions);
    _dependencyName(alias: string): string;
    _installDependency(alias: string, plugin: Plugin): Promise<Plugin>;
    _ensureJobsResource(): Promise<void>;
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    onUninstall(options?: {
        purgeData?: boolean;
    }): Promise<void>;
    /**
     * Register a job processor.
     */
    setProcessor(handler: Function, { autoStart, concurrency }?: {
        autoStart?: boolean;
        concurrency?: number;
    }): Promise<void>;
    /**
     * Enqueue a persona job.
     */
    enqueueJob(data: PersonaJob, options?: any): Promise<any>;
    startProcessing(options?: {
        concurrency?: number;
    }): Promise<void>;
    stopProcessing(): Promise<void>;
    queueHandler(record: any, context: any): Promise<any>;
}
export default CookieFarmSuitePlugin;
//# sourceMappingURL=cookie-farm-suite.plugin.d.ts.map