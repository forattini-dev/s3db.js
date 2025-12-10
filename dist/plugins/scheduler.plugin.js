import { CoordinatorPlugin } from "./concerns/coordinator-plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { idGenerator } from "../concerns/id.js";
import { SchedulerError } from "./scheduler.errors.js";
import { createLogger } from '../concerns/logger.js';
export class SchedulerPlugin extends CoordinatorPlugin {
    config;
    jobs = new Map();
    activeJobs = new Map();
    timers = new Map();
    statistics = new Map();
    constructor(options = {}) {
        super(options);
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            const logLevel = (this.logLevel || 'info');
            this.logger = createLogger({ name: 'SchedulerPlugin', level: logLevel });
        }
        const opts = this.options;
        const { timezone = 'UTC', jobs = {}, defaultTimeout = 300000, defaultRetries = 1, jobHistoryResource = 'plg_job_executions', persistJobs = true, onJobStart = null, onJobComplete = null, onJobError = null, ...rest } = opts;
        this.config = {
            timezone: timezone,
            jobs: jobs,
            defaultTimeout: defaultTimeout,
            defaultRetries: defaultRetries,
            jobHistoryResource: jobHistoryResource,
            persistJobs: persistJobs,
            logLevel: this.logLevel,
            onJobStart: onJobStart,
            onJobComplete: onJobComplete,
            onJobError: onJobError,
            ...rest
        };
        this._validateConfiguration();
    }
    _isTestEnvironment() {
        return process.env.NODE_ENV === 'test' ||
            process.env.JEST_WORKER_ID !== undefined ||
            global.expect !== undefined;
    }
    _validateConfiguration() {
        if (Object.keys(this.config.jobs).length === 0) {
            throw new SchedulerError('At least one job must be defined', {
                operation: 'validateConfiguration',
                jobCount: 0,
                suggestion: 'Provide at least one job in the jobs configuration: { jobs: { myJob: { schedule: "* * * * *", action: async () => {...} } } }'
            });
        }
        for (const [jobName, job] of Object.entries(this.config.jobs)) {
            if (!job.schedule) {
                throw new SchedulerError(`Job '${jobName}' must have a schedule`, {
                    operation: 'validateConfiguration',
                    taskId: jobName,
                    providedConfig: Object.keys(job),
                    suggestion: 'Add a schedule property with a valid cron expression: { schedule: "0 * * * *", action: async () => {...} }'
                });
            }
            if (!job.action || typeof job.action !== 'function') {
                throw new SchedulerError(`Job '${jobName}' must have an action function`, {
                    operation: 'validateConfiguration',
                    taskId: jobName,
                    actionType: typeof job.action,
                    suggestion: 'Provide an action function: { schedule: "...", action: async (db, ctx) => {...} }'
                });
            }
            if (!this._isValidCronExpression(job.schedule)) {
                throw new SchedulerError(`Job '${jobName}' has invalid cron expression`, {
                    operation: 'validateConfiguration',
                    taskId: jobName,
                    cronExpression: job.schedule,
                    suggestion: 'Use valid cron format (5 fields: minute hour day month weekday) or shortcuts (@hourly, @daily, @weekly, @monthly, @yearly)'
                });
            }
        }
    }
    _isValidCronExpression(expr) {
        if (typeof expr !== 'string')
            return false;
        const shortcuts = ['@yearly', '@annually', '@monthly', '@weekly', '@daily', '@hourly'];
        if (shortcuts.includes(expr))
            return true;
        const parts = expr.trim().split(/\s+/);
        if (parts.length !== 5)
            return false;
        return true;
    }
    async onInstall() {
        if (this.config.persistJobs) {
            await this._createJobHistoryResource();
        }
        for (const [jobName, jobConfig] of Object.entries(this.config.jobs)) {
            this.jobs.set(jobName, {
                ...jobConfig,
                enabled: jobConfig.enabled !== false,
                retries: jobConfig.retries || this.config.defaultRetries,
                timeout: jobConfig.timeout || this.config.defaultTimeout,
                lastRun: null,
                nextRun: null,
                runCount: 0,
                successCount: 0,
                errorCount: 0
            });
            this.statistics.set(jobName, {
                totalRuns: 0,
                totalSuccesses: 0,
                totalErrors: 0,
                avgDuration: 0,
                lastRun: null,
                lastSuccess: null,
                lastError: null
            });
        }
        this.emit('db:plugin:initialized', { jobs: this.jobs.size });
        await this.startCoordination();
    }
    async _createJobHistoryResource() {
        if (!this.database)
            return;
        const [ok] = await tryFn(() => this.database.createResource({
            name: this.config.jobHistoryResource,
            attributes: {
                id: 'string|required',
                jobName: 'string|required',
                status: 'string|required',
                startTime: 'number|required',
                endTime: 'number',
                duration: 'number',
                result: 'json|default:null',
                error: 'string|default:null',
                retryCount: 'number|default:0',
                createdAt: 'string|required'
            },
            behavior: 'body-overflow',
            partitions: {
                byJob: { fields: { jobName: 'string' } },
                byDate: { fields: { createdAt: 'string|maxlength:10' } }
            }
        }));
    }
    async onBecomeCoordinator() {
        this.logger.debug({ workerId: this.workerId }, 'Global coordinator elected this worker as leader - starting job scheduling');
        await this._startScheduling();
        this.emit('plg:scheduler:coordinator-promoted', {
            workerId: this.workerId,
            timestamp: Date.now()
        });
    }
    async onStopBeingCoordinator() {
        this.logger.debug({ workerId: this.workerId }, 'Global coordinator demoted this worker from leader - job timers will be stopped automatically');
        this.emit('plg:scheduler:coordinator-demoted', {
            workerId: this.workerId,
            timestamp: Date.now()
        });
    }
    async coordinatorWork() {
        // Scheduler uses setTimeout-based job scheduling rather than a work loop
    }
    async _startScheduling() {
        for (const [jobName, job] of this.jobs) {
            if (job.enabled) {
                this._scheduleNextExecution(jobName);
            }
        }
    }
    _scheduleNextExecution(jobName) {
        const job = this.jobs.get(jobName);
        if (!job || !job.enabled)
            return;
        const nextRun = this._calculateNextRun(job.schedule);
        job.nextRun = nextRun;
        const delay = nextRun.getTime() - Date.now();
        if (delay > 0) {
            const timer = setTimeout(() => {
                this._executeJob(jobName);
            }, delay);
            this.timers.set(jobName, timer);
            this.logger.debug({ jobName, nextRun: nextRun.toISOString(), delayMs: delay }, `Scheduled job '${jobName}' for ${nextRun.toISOString()}`);
        }
    }
    _calculateNextRun(schedule) {
        const now = new Date();
        if (schedule === '@yearly' || schedule === '@annually') {
            const next = new Date(now);
            next.setFullYear(next.getFullYear() + 1);
            next.setMonth(0, 1);
            next.setHours(0, 0, 0, 0);
            return next;
        }
        if (schedule === '@monthly') {
            const next = new Date(now);
            next.setMonth(next.getMonth() + 1, 1);
            next.setHours(0, 0, 0, 0);
            return next;
        }
        if (schedule === '@weekly') {
            const next = new Date(now);
            next.setDate(next.getDate() + (7 - next.getDay()));
            next.setHours(0, 0, 0, 0);
            return next;
        }
        if (schedule === '@daily') {
            const next = new Date(now);
            next.setDate(next.getDate() + 1);
            next.setHours(0, 0, 0, 0);
            return next;
        }
        if (schedule === '@hourly') {
            const next = new Date(now);
            next.setHours(next.getHours() + 1, 0, 0, 0);
            return next;
        }
        const [minute, hour] = schedule.split(/\s+/);
        const next = new Date(now);
        next.setMinutes(parseInt(minute ?? '0') || 0);
        next.setSeconds(0);
        next.setMilliseconds(0);
        if (hour !== '*') {
            next.setHours(parseInt(hour ?? '0'));
        }
        if (next <= now) {
            if (hour !== '*') {
                next.setDate(next.getDate() + 1);
            }
            else {
                next.setHours(next.getHours() + 1);
            }
        }
        if (this._isTestEnvironment()) {
            next.setTime(next.getTime() + 1000);
        }
        return next;
    }
    _calculateNextRunFromConfig(config = {}) {
        if (!config || config.enabled === false) {
            return null;
        }
        const schedule = typeof config.schedule === 'string' ? config.schedule.trim() : '';
        if (!schedule) {
            return null;
        }
        const nextRun = this._calculateNextRun(schedule);
        if (config.timezone) {
            try {
                const localized = nextRun.toLocaleString('en-US', { timeZone: config.timezone });
                const tzDate = new Date(localized);
                if (!Number.isNaN(tzDate.getTime())) {
                    return tzDate;
                }
            }
            catch (error) {
                this.logger.warn({ timezone: config.timezone, error: error.message }, 'Failed to apply timezone adjustment');
            }
        }
        return nextRun;
    }
    async _executeJob(jobName) {
        const job = this.jobs.get(jobName);
        if (!job) {
            return;
        }
        if (this.activeJobs.has(jobName)) {
            return;
        }
        this.activeJobs.set(jobName, 'acquiring-lock');
        const storage = this.getStorage();
        const lockName = `job-${jobName}`;
        const lock = await storage.acquireLock(lockName, {
            ttl: Math.ceil(job.timeout / 1000) + 60,
            timeout: 0,
            workerId: process.pid ? String(process.pid) : 'unknown'
        });
        if (!lock) {
            this.logger.debug({ jobName }, `Job '${jobName}' already running on another instance`);
            this.activeJobs.delete(jobName);
            return;
        }
        const executionId = `${jobName}_${idGenerator()}`;
        const startTime = Date.now();
        const context = {
            jobName,
            executionId,
            scheduledTime: new Date(startTime),
            database: this.database
        };
        const setTimer = (globalThis?.originalSetTimeout ||
            globalThis?.setTimeout ||
            setTimeout);
        const clearTimer = (globalThis?.originalClearTimeout ||
            globalThis?.clearTimeout ||
            clearTimeout);
        this.activeJobs.set(jobName, executionId);
        try {
            if (this.config.onJobStart) {
                await this._executeHook(this.config.onJobStart, jobName, context);
            }
            this.emit('plg:scheduler:job-start', { jobName, executionId, startTime });
            let attempt = 0;
            let lastError = null;
            let result = null;
            let status = 'success';
            const isTestEnvironment = this._isTestEnvironment();
            while (attempt <= job.retries) {
                try {
                    const actualTimeout = isTestEnvironment ? Math.min(job.timeout, 1000) : job.timeout;
                    let timeoutId;
                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutId = setTimer(() => reject(new Error('Job execution timeout')), actualTimeout);
                    });
                    const jobPromise = job.action(this.database, context, this);
                    try {
                        result = await Promise.race([jobPromise, timeoutPromise]);
                        clearTimer(timeoutId);
                    }
                    catch (raceError) {
                        clearTimer(timeoutId);
                        throw raceError;
                    }
                    status = 'success';
                    break;
                }
                catch (error) {
                    lastError = error;
                    attempt++;
                    if (attempt <= job.retries) {
                        this.logger.warn({ jobName, attempt: attempt + 1, totalAttempts: job.retries + 1, error: error.message }, `Job '${jobName}' failed (attempt ${attempt + 1}): ${error.message}`);
                        const baseDelay = Math.min(Math.pow(2, attempt) * 1000, 5000);
                        const delay = isTestEnvironment ? 1 : baseDelay;
                        await new Promise(resolve => setTimer(resolve, delay));
                    }
                }
            }
            const endTime = Date.now();
            const duration = Math.max(1, endTime - startTime);
            if (lastError && attempt > job.retries) {
                status = lastError.message.includes('timeout') ? 'timeout' : 'error';
            }
            job.lastRun = new Date(endTime);
            job.runCount++;
            if (status === 'success') {
                job.successCount++;
            }
            else {
                job.errorCount++;
            }
            const stats = this.statistics.get(jobName);
            stats.totalRuns++;
            stats.lastRun = new Date(endTime);
            if (status === 'success') {
                stats.totalSuccesses++;
                stats.lastSuccess = new Date(endTime);
            }
            else {
                stats.totalErrors++;
                stats.lastError = { time: new Date(endTime), message: lastError?.message || 'Unknown error' };
            }
            stats.avgDuration = ((stats.avgDuration * (stats.totalRuns - 1)) + duration) / stats.totalRuns;
            if (this.config.persistJobs) {
                await this._persistJobExecution(jobName, executionId, startTime, endTime, duration, status, result, lastError, attempt);
            }
            if (status === 'success' && this.config.onJobComplete) {
                await this._executeHook(this.config.onJobComplete, jobName, result, duration);
            }
            else if (status !== 'success' && this.config.onJobError) {
                await this._executeHook(this.config.onJobError, jobName, lastError, attempt);
            }
            this.emit('plg:scheduler:job-complete', {
                jobName,
                executionId,
                status,
                duration,
                result,
                error: lastError?.message,
                retryCount: attempt
            });
            this.activeJobs.delete(jobName);
            if (job.enabled) {
                this._scheduleNextExecution(jobName);
            }
            if (lastError && status !== 'success') {
                throw lastError;
            }
        }
        finally {
            if (lock) {
                await tryFn(() => storage.releaseLock(lock));
            }
        }
    }
    async _persistJobExecution(jobName, executionId, startTime, endTime, duration, status, result, error, retryCount) {
        if (!this.database)
            return;
        const [ok, err] = await tryFn(() => this.database.resources[this.config.jobHistoryResource].insert({
            id: executionId,
            jobName,
            status,
            startTime,
            endTime,
            duration,
            result: result ? JSON.stringify(result) : null,
            error: error?.message || null,
            retryCount,
            createdAt: new Date(startTime).toISOString().slice(0, 10)
        }));
        if (!ok) {
            this.logger.warn({ error: err.message }, `Failed to persist job execution: ${err.message}`);
        }
    }
    async _executeHook(hook, ...args) {
        if (typeof hook === 'function') {
            const [ok, err] = await tryFn(() => hook(...args));
            if (!ok) {
                this.logger.warn({ error: err.message }, `Hook execution failed: ${err.message}`);
            }
        }
    }
    async runJob(jobName, context = {}) {
        const job = this.jobs.get(jobName);
        if (!job) {
            throw new SchedulerError(`Job '${jobName}' not found`, {
                operation: 'runJob',
                taskId: jobName,
                availableJobs: Array.from(this.jobs.keys()),
                suggestion: 'Check job name or use getAllJobsStatus() to list available jobs'
            });
        }
        if (this.activeJobs.has(jobName)) {
            throw new SchedulerError(`Job '${jobName}' is already running`, {
                operation: 'runJob',
                taskId: jobName,
                executionId: this.activeJobs.get(jobName),
                suggestion: 'Wait for current execution to complete or check job status with getJobStatus()'
            });
        }
        await this._executeJob(jobName);
    }
    enableJob(jobName) {
        const job = this.jobs.get(jobName);
        if (!job) {
            throw new SchedulerError(`Job '${jobName}' not found`, {
                operation: 'enableJob',
                taskId: jobName,
                availableJobs: Array.from(this.jobs.keys()),
                suggestion: 'Check job name or use getAllJobsStatus() to list available jobs'
            });
        }
        job.enabled = true;
        this._scheduleNextExecution(jobName);
        this.emit('plg:scheduler:job-enabled', { jobName });
    }
    disableJob(jobName) {
        const job = this.jobs.get(jobName);
        if (!job) {
            throw new SchedulerError(`Job '${jobName}' not found`, {
                operation: 'disableJob',
                taskId: jobName,
                availableJobs: Array.from(this.jobs.keys()),
                suggestion: 'Check job name or use getAllJobsStatus() to list available jobs'
            });
        }
        job.enabled = false;
        const timer = this.timers.get(jobName);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(jobName);
        }
        this.emit('plg:scheduler:job-disabled', { jobName });
    }
    getJobStatus(jobName) {
        const job = this.jobs.get(jobName);
        const stats = this.statistics.get(jobName);
        if (!job || !stats) {
            return null;
        }
        return {
            name: jobName,
            enabled: job.enabled,
            schedule: job.schedule,
            description: job.description,
            lastRun: job.lastRun,
            nextRun: job.nextRun,
            isRunning: this.activeJobs.has(jobName),
            statistics: {
                totalRuns: stats.totalRuns,
                totalSuccesses: stats.totalSuccesses,
                totalErrors: stats.totalErrors,
                successRate: stats.totalRuns > 0 ? (stats.totalSuccesses / stats.totalRuns) * 100 : 0,
                avgDuration: Math.round(stats.avgDuration),
                lastSuccess: stats.lastSuccess,
                lastError: stats.lastError
            }
        };
    }
    getAllJobsStatus() {
        const jobs = [];
        for (const jobName of this.jobs.keys()) {
            const status = this.getJobStatus(jobName);
            if (status) {
                jobs.push(status);
            }
        }
        return jobs;
    }
    async getJobHistory(jobName, options = {}) {
        if (!this.config.persistJobs || !this.database) {
            return [];
        }
        const { limit = 50, status = null } = options;
        const queryParams = {
            jobName
        };
        if (status) {
            queryParams.status = status;
        }
        const [ok, err, history] = await tryFn(() => this.database.resources[this.config.jobHistoryResource].query(queryParams));
        if (!ok) {
            this.logger.warn({ error: err.message }, `Failed to get job history: ${err.message}`);
            return [];
        }
        const filtered = history
            .sort((a, b) => b.startTime - a.startTime)
            .slice(0, limit);
        return filtered.map(h => {
            let result = null;
            if (h.result) {
                try {
                    result = JSON.parse(h.result);
                }
                catch {
                    result = h.result;
                }
            }
            return {
                id: h.id,
                status: h.status,
                startTime: new Date(h.startTime),
                endTime: h.endTime ? new Date(h.endTime) : null,
                duration: h.duration,
                result,
                error: h.error,
                retryCount: h.retryCount
            };
        });
    }
    addJob(jobName, jobConfig) {
        if (this.jobs.has(jobName)) {
            throw new SchedulerError(`Job '${jobName}' already exists`, {
                operation: 'addJob',
                taskId: jobName,
                existingJobs: Array.from(this.jobs.keys()),
                suggestion: 'Use a different job name or remove the existing job first with removeJob()'
            });
        }
        if (!jobConfig.schedule || !jobConfig.action) {
            throw new SchedulerError('Job must have schedule and action', {
                operation: 'addJob',
                taskId: jobName,
                providedConfig: Object.keys(jobConfig),
                suggestion: 'Provide both schedule and action: { schedule: "0 * * * *", action: async (db, ctx) => {...} }'
            });
        }
        if (!this._isValidCronExpression(jobConfig.schedule)) {
            throw new SchedulerError('Invalid cron expression', {
                operation: 'addJob',
                taskId: jobName,
                cronExpression: jobConfig.schedule,
                suggestion: 'Use valid cron format (5 fields) or shortcuts (@hourly, @daily, @weekly, @monthly, @yearly)'
            });
        }
        const job = {
            ...jobConfig,
            enabled: jobConfig.enabled !== false,
            retries: jobConfig.retries ?? this.config.defaultRetries,
            timeout: jobConfig.timeout ?? this.config.defaultTimeout,
            lastRun: null,
            nextRun: null,
            runCount: 0,
            successCount: 0,
            errorCount: 0
        };
        this.jobs.set(jobName, job);
        this.statistics.set(jobName, {
            totalRuns: 0,
            totalSuccesses: 0,
            totalErrors: 0,
            avgDuration: 0,
            lastRun: null,
            lastSuccess: null,
            lastError: null
        });
        if (job.enabled) {
            this._scheduleNextExecution(jobName);
        }
        this.emit('plg:scheduler:job-added', { jobName });
    }
    removeJob(jobName) {
        const job = this.jobs.get(jobName);
        if (!job) {
            throw new SchedulerError(`Job '${jobName}' not found`, {
                operation: 'removeJob',
                taskId: jobName,
                availableJobs: Array.from(this.jobs.keys()),
                suggestion: 'Check job name or use getAllJobsStatus() to list available jobs'
            });
        }
        const timer = this.timers.get(jobName);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(jobName);
        }
        this.jobs.delete(jobName);
        this.statistics.delete(jobName);
        this.activeJobs.delete(jobName);
        this.emit('plg:scheduler:job-removed', { jobName });
    }
    getPlugin(pluginName) {
        return null;
    }
    async start() {
        this.logger.debug({ jobCount: this.jobs.size }, `Started with ${this.jobs.size} jobs`);
    }
    async stop() {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        if (!this._isTestEnvironment() && this.activeJobs.size > 0) {
            this.logger.debug({ activeJobCount: this.activeJobs.size }, `Waiting for ${this.activeJobs.size} active jobs to complete...`);
            const timeout = 5000;
            const start = Date.now();
            while (this.activeJobs.size > 0 && (Date.now() - start) < timeout) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (this.activeJobs.size > 0) {
                this.logger.warn(`[SchedulerPlugin] ${this.activeJobs.size} jobs still running after timeout`);
            }
        }
        if (this._isTestEnvironment()) {
            this.activeJobs.clear();
        }
        this.jobs.clear();
        this.statistics.clear();
        this.activeJobs.clear();
        this.removeAllListeners();
        await this.stopCoordination();
    }
}
//# sourceMappingURL=scheduler.plugin.js.map