/**
 * CommandRunner
 *
 * Executes RedBlue CLI commands:
 * - Unified interface for all rb commands
 * - JSON output parsing
 * - Error handling
 * - Availability detection
 */
export interface CommandOptions {
    timeout?: number;
    flags?: string[];
    cwd?: string;
}
export interface CommandResult {
    status: 'ok' | 'error' | 'unavailable' | 'timeout';
    data?: any;
    raw?: string;
    error?: string;
    exitCode?: number;
    metadata: {
        command: string;
        duration: number;
        timestamp: string;
    };
}
export interface ReconPlugin {
    config: {
        timeout?: {
            default?: number;
        };
    };
}
export declare class CommandRunner {
    private plugin;
    private redBlueAvailable;
    constructor(plugin: ReconPlugin);
    isRedBlueAvailable(): Promise<boolean>;
    runRedBlue(category: string, subCategory: string, command: string, target: string, options?: CommandOptions): Promise<CommandResult>;
    runSimple(command: string, args: string[], options?: CommandOptions): Promise<CommandResult>;
    private _executeCommand;
}
//# sourceMappingURL=command-runner.d.ts.map