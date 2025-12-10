export interface CloudResourceSnapshot {
    resourceType: string;
    resourceId: string;
    configuration?: Record<string, unknown>;
}
interface TerraformResourceInstance {
    schema_version: number;
    attributes: Record<string, unknown>;
    private: string;
    dependencies: string[];
}
interface TerraformResource {
    mode: string;
    type: string;
    name: string;
    provider: string;
    instances: TerraformResourceInstance[];
}
interface TerraformState {
    version: number;
    terraform_version: string;
    serial: number;
    lineage: string;
    outputs: Record<string, unknown>;
    resources: TerraformResource[];
}
interface ExportOptions {
    terraformVersion?: string;
    lineage?: string;
    serial?: number;
    outputs?: Record<string, unknown>;
    resourceTypes?: string[];
    providers?: string[];
}
interface ExportResult {
    state: TerraformState;
    stats: {
        total: number;
        converted: number;
        skipped: number;
        skippedTypes: string[];
    };
}
export declare function convertToTerraformResource(resource: CloudResourceSnapshot): TerraformResource | null;
export declare function exportToTerraformState(snapshots: CloudResourceSnapshot[], options?: ExportOptions): ExportResult;
declare const _default: {
    convertToTerraformResource: typeof convertToTerraformResource;
    exportToTerraformState: typeof exportToTerraformState;
    RESOURCE_TYPE_MAP: Record<string, string>;
};
export default _default;
//# sourceMappingURL=terraform-exporter.d.ts.map