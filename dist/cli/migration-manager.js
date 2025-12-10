/**
 * Migration Manager for s3db.js
 * Handles database schema migrations
 */
import fs from 'fs/promises';
import path from 'path';
export class MigrationManager {
    database;
    migrationsDir;
    migrationResource;
    constructor(database, migrationsDir = './migrations') {
        this.database = database;
        this.migrationsDir = migrationsDir;
        this.migrationResource = null;
    }
    /**
     * Initialize migrations system
     */
    async init() {
        if (!this.database) {
            throw new Error('Database connection required for initialization');
        }
        // Create migrations resource if it doesn't exist
        const resources = await this.database.listResources();
        const exists = resources.find(r => r.name === '_migrations');
        if (!exists) {
            this.migrationResource = await this.database.createResource({
                name: '_migrations',
                attributes: {
                    id: 'string|required',
                    name: 'string|required',
                    batch: 'number|default:1',
                    executedAt: 'string'
                },
                timestamps: true,
                behavior: 'enforce-limits'
            });
        }
        else {
            this.migrationResource = await this.database.getResource('_migrations');
        }
        // Ensure migrations directory exists
        try {
            await fs.mkdir(this.migrationsDir, { recursive: true });
        }
        catch (err) {
            // Directory exists or other error
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }
    }
    /**
     * Generate a new migration file
     */
    async generate(name) {
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
        const filename = `${timestamp}_${name}.js`;
        const filepath = path.join(this.migrationsDir, filename);
        const template = `/**
 * Migration: ${name}
 * Generated: ${new Date().toISOString()}
 */

export async function up(database) {
  // Add migration logic here
  // Example:
  // await database.createResource({
  //   name: 'users',
  //   attributes: {
  //     id: 'string|required',
  //     email: 'string|required|email',
  //     name: 'string|required'
  //   },
  //   timestamps: true
  // });
}

export async function down(database) {
  // Add rollback logic here
  // Example:
  // await database.deleteResource('users');
}
`;
        // Ensure dir exists even for generate
        try {
            await fs.mkdir(this.migrationsDir, { recursive: true });
        }
        catch (err) {
            if (err.code !== 'EEXIST')
                throw err;
        }
        await fs.writeFile(filepath, template);
        return { filename, filepath };
    }
    /**
     * Get all migration files
     */
    async getMigrationFiles() {
        try {
            const files = await fs.readdir(this.migrationsDir);
            return files
                .filter(f => f.endsWith('.js'))
                .sort();
        }
        catch (err) {
            return [];
        }
    }
    /**
     * Get executed migrations from database
     */
    async getExecutedMigrations() {
        if (!this.migrationResource)
            return [];
        try {
            const migrations = (await this.migrationResource.list());
            return migrations.map(m => m.name);
        }
        catch (err) {
            return [];
        }
    }
    /**
     * Get current batch number
     */
    async getCurrentBatch() {
        if (!this.migrationResource)
            return 0;
        try {
            const migrations = (await this.migrationResource.list());
            if (migrations.length === 0)
                return 0;
            const batches = migrations.map(m => m.batch || 0);
            return Math.max(...batches);
        }
        catch (err) {
            return 0;
        }
    }
    /**
     * Get pending migrations
     */
    async getPendingMigrations() {
        const allFiles = await this.getMigrationFiles();
        const executed = await this.getExecutedMigrations();
        return allFiles.filter(f => !executed.includes(f));
    }
    /**
     * Run pending migrations
     */
    async up(options = {}) {
        if (!this.database || !this.migrationResource)
            throw new Error('Not initialized');
        const { step = null } = options;
        const pending = await this.getPendingMigrations();
        if (pending.length === 0) {
            return { message: 'No pending migrations', migrations: [] };
        }
        const toRun = step ? pending.slice(0, step) : pending;
        const batch = (await this.getCurrentBatch()) + 1;
        const executed = [];
        for (const filename of toRun) {
            const filepath = path.join(process.cwd(), this.migrationsDir, filename);
            // Dynamic import
            const migration = await import(filepath);
            // Execute up
            await migration.up(this.database);
            // Record migration
            await this.migrationResource.insert({
                id: filename,
                name: filename,
                batch,
                executedAt: new Date().toISOString()
            });
            executed.push(filename);
        }
        return { message: `Executed ${executed.length} migrations`, migrations: executed, batch };
    }
    /**
     * Rollback migrations
     */
    async down(options = {}) {
        if (!this.database || !this.migrationResource)
            throw new Error('Not initialized');
        const { step = 1 } = options;
        const allMigrations = (await this.migrationResource.list());
        if (allMigrations.length === 0) {
            return { message: 'No migrations to rollback', migrations: [] };
        }
        // Sort by batch descending, then by name descending
        allMigrations.sort((a, b) => {
            if (a.batch !== b.batch)
                return b.batch - a.batch;
            return b.name.localeCompare(a.name);
        });
        const currentBatch = allMigrations[0].batch;
        const toRollback = allMigrations
            .filter(m => m.batch === currentBatch)
            .slice(0, step);
        const rolledBack = [];
        for (const migration of toRollback) {
            const filepath = path.join(process.cwd(), this.migrationsDir, migration.name);
            const migrationModule = await import(filepath);
            // Execute down
            await migrationModule.down(this.database);
            // Remove migration record
            await this.migrationResource.delete(migration.id);
            rolledBack.push(migration.name);
        }
        return { message: `Rolled back ${rolledBack.length} migrations`, migrations: rolledBack };
    }
    /**
     * Reset all migrations
     */
    async reset() {
        if (!this.database || !this.migrationResource)
            throw new Error('Not initialized');
        const allMigrations = (await this.migrationResource.list());
        // Sort in reverse order for rollback
        allMigrations.sort((a, b) => {
            if (a.batch !== b.batch)
                return b.batch - a.batch;
            return b.name.localeCompare(a.name);
        });
        const rolledBack = [];
        for (const migration of allMigrations) {
            const filepath = path.join(process.cwd(), this.migrationsDir, migration.name);
            const migrationModule = await import(filepath);
            // Execute down
            await migrationModule.down(this.database);
            // Remove migration record
            await this.migrationResource.delete(migration.id);
            rolledBack.push(migration.name);
        }
        return { message: `Reset ${rolledBack.length} migrations`, migrations: rolledBack };
    }
    /**
     * Get migration status
     */
    async status() {
        if (!this.migrationResource)
            return [];
        const allFiles = await this.getMigrationFiles();
        const executed = await this.getExecutedMigrations();
        const executedRecords = (await this.migrationResource.list());
        const executedMap = {};
        executedRecords.forEach(m => {
            executedMap[m.name] = m;
        });
        return allFiles.map(filename => {
            const isExecuted = executed.includes(filename);
            const record = executedMap[filename];
            return {
                name: filename,
                status: isExecuted ? 'executed' : 'pending',
                batch: record?.batch || null,
                executedAt: record?.executedAt || null
            };
        });
    }
}
export default MigrationManager;
//# sourceMappingURL=migration-manager.js.map