/**
 * Migration Manager for s3db.js
 * Handles database schema migrations
 */
import type { S3db } from '../database.class.js';
import type Resource from '../resource.class.js';
export interface MigrationRecord {
    id: string;
    name: string;
    batch: number;
    executedAt: string;
}
export interface MigrationModule {
    up: (database: S3db) => Promise<void>;
    down: (database: S3db) => Promise<void>;
}
export declare class MigrationManager {
    database: S3db | null;
    migrationsDir: string;
    migrationResource: Resource | null;
    constructor(database: S3db | null, migrationsDir?: string);
    /**
     * Initialize migrations system
     */
    init(): Promise<void>;
    /**
     * Generate a new migration file
     */
    generate(name: string): Promise<{
        filename: string;
        filepath: string;
    }>;
    /**
     * Get all migration files
     */
    getMigrationFiles(): Promise<string[]>;
    /**
     * Get executed migrations from database
     */
    getExecutedMigrations(): Promise<string[]>;
    /**
     * Get current batch number
     */
    getCurrentBatch(): Promise<number>;
    /**
     * Get pending migrations
     */
    getPendingMigrations(): Promise<string[]>;
    /**
     * Run pending migrations
     */
    up(options?: {
        step?: number | null;
    }): Promise<{
        message: string;
        migrations: string[];
        batch?: number;
    }>;
    /**
     * Rollback migrations
     */
    down(options?: {
        step?: number;
    }): Promise<{
        message: string;
        migrations: string[];
    }>;
    /**
     * Reset all migrations
     */
    reset(): Promise<{
        message: string;
        migrations: string[];
    }>;
    /**
     * Get migration status
     */
    status(): Promise<any[]>;
}
export default MigrationManager;
//# sourceMappingURL=migration-manager.d.ts.map