export interface MetricValue {
    labels: Record<string, string>;
    value: number | string;
}
export interface OperationData {
    count: number;
    totalTime: number;
    errors: number;
}
export interface PoolMetrics {
    tasksStarted: number;
    tasksCompleted: number;
    tasksFailed: number;
    tasksRetried: number;
    avgExecutionTime: number;
    totalExecutionTime: number;
}
export interface MetricsData {
    operations: Record<string, OperationData>;
    resources: Record<string, Record<string, OperationData>>;
    startTime: string;
    pool?: PoolMetrics;
}
export interface MetricsPlugin {
    metrics: MetricsData;
}
declare function sanitizeLabel(value: unknown): string;
declare function sanitizeMetricName(name: string): string;
declare function formatLabels(labels: Record<string, string> | null | undefined): string;
declare function formatMetric(name: string, type: string, help: string, values: MetricValue[]): string;
export declare function formatPrometheusMetrics(metricsPlugin: MetricsPlugin): string;
declare const _default: {
    formatPrometheusMetrics: typeof formatPrometheusMetrics;
    formatMetric: typeof formatMetric;
    sanitizeLabel: typeof sanitizeLabel;
    sanitizeMetricName: typeof sanitizeMetricName;
    formatLabels: typeof formatLabels;
};
export default _default;
//# sourceMappingURL=prometheus-formatter.d.ts.map