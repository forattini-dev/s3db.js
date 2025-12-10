import type { Logger } from '../../../concerns/logger.js';
export interface PathRule {
    path?: string;
    pattern?: string;
    required?: boolean;
    methods?: string[];
}
export interface DriverEntry {
    driver: string;
    config?: DriverConfig;
}
export interface DriverConfig {
    resource?: string;
    [key: string]: unknown;
}
export interface AuthOptions {
    drivers?: Array<string | DriverEntry>;
    driver?: string | {
        driver: string;
        config?: DriverConfig;
    };
    config?: DriverConfig;
    pathRules?: PathRule[];
    pathAuth?: boolean | Record<string, unknown>;
    strategy?: string;
    priorities?: Record<string, number>;
    createResource?: boolean;
}
export interface NormalizedAuthConfig {
    drivers: DriverEntry[];
    pathRules: PathRule[];
    pathAuth: boolean | Record<string, unknown> | undefined;
    strategy: string;
    priorities: Record<string, number>;
    createResource: boolean;
    resource: string | null;
    driver: string | null;
}
export declare function normalizeAuthConfig(authOptions?: AuthOptions | null | undefined, logger?: Logger | null): NormalizedAuthConfig;
//# sourceMappingURL=normalize-auth.d.ts.map