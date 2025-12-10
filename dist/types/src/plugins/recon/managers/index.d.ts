/**
 * ReconPlugin Managers
 *
 * Module exports for manager classes:
 * - StorageManager - Report persistence and resource management
 * - TargetManager - Dynamic target CRUD operations
 * - SchedulerManager - Cron-based scheduled sweeps
 * - DependencyManager - RedBlue availability validation
 */
export { StorageManager, type ReconPlugin as StorageReconPlugin, type PluginStorage, type StageData, type ReportFingerprint, type Report as StorageReport, type DiffEntry, type HistoryEntry, type IndexData, type HostRecord } from './storage-manager.js';
export { TargetManager, type NormalizedTarget as TargetNormalizedTarget, type TargetOptions, type TargetRecord, type ListOptions, type ReconPlugin as TargetReconPlugin, type TargetConfigEntry, type Report as TargetReport } from './target-manager.js';
export { SchedulerManager, type ReconPlugin as SchedulerReconPlugin, type SchedulerPlugin, type JobConfig, type DiagnosticOptions, type Report as SchedulerReport, type TargetEntry } from './scheduler-manager.js';
export { DependencyManager, type ReconPlugin as DependencyReconPlugin, type DependencyWarning, type DependencyCheckResult, type ToolStatus } from './dependency-manager.js';
//# sourceMappingURL=index.d.ts.map