export interface PatternConfig {
    match: string | RegExp;
    activities?: string[];
    extract?: Record<string, string>;
    priority?: number;
    metadata?: Record<string, unknown>;
}
export interface CompiledPattern {
    name: string;
    original: string | RegExp;
    activities: string[];
    extract: Record<string, string>;
    priority: number;
    metadata: Record<string, unknown>;
    regex: RegExp | null;
    paramNames: string[];
}
export interface MatchResult {
    pattern: string;
    params: Record<string, string>;
    activities: string[];
    metadata: Record<string, unknown>;
    priority: number;
    config: CompiledPattern | {
        name: string;
        activities?: string[];
        metadata?: Record<string, unknown>;
    };
    isDefault?: boolean;
}
export interface FilteredUrl {
    url: string;
    match: MatchResult;
}
export declare class URLPatternMatcher {
    patterns: Map<string, CompiledPattern>;
    defaultPattern: {
        name: string;
        activities?: string[];
        metadata?: Record<string, unknown>;
    } | null;
    constructor(patterns?: Record<string, PatternConfig>);
    private _compilePattern;
    private _pathToRegex;
    match(url: string): MatchResult | null;
    private _extractParams;
    matches(url: string): boolean;
    getPatternNames(): string[];
    addPattern(name: string, config: PatternConfig): void;
    removePattern(name: string): void;
    filterUrls(urls: string[], patternNames?: string[]): FilteredUrl[];
}
export default URLPatternMatcher;
//# sourceMappingURL=url-pattern-matcher.d.ts.map