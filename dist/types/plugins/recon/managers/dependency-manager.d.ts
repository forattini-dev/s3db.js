/**
 * DependencyManager
 *
 * Validates RedBlue (rb) availability:
 * - Single binary check (replaces ~30 individual tools)
 * - Provides installation guidance
 * - Emits warnings if rb is not found
 */
import type { CommandRunner } from '../concerns/command-runner.js';
export interface ReconPlugin {
    commandRunner: CommandRunner;
    emit(event: string, data: any): void;
}
export interface DependencyWarning {
    tool: string;
    message: string;
    installGuide: string;
}
export interface DependencyCheckResult {
    available: number;
    missing: number;
    availableTools: string[];
    missingTools: string[];
    warnings: DependencyWarning[];
}
export interface ToolStatus {
    available: boolean;
    required: boolean;
    description: string;
}
export declare class DependencyManager {
    private plugin;
    constructor(plugin: ReconPlugin);
    checkAll(): Promise<DependencyWarning[]>;
    checkTool(toolName: string): Promise<boolean>;
    getToolStatus(): Promise<Record<string, ToolStatus>>;
    private _getInstallGuide;
}
//# sourceMappingURL=dependency-manager.d.ts.map