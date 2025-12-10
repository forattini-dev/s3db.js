export type AuthDriverName = 'jwt' | 'apiKey' | 'basic' | 'oauth2' | 'oidc';
export interface PathAuthRule {
    pattern: string;
    drivers?: AuthDriverName[];
    required?: boolean;
    [key: string]: unknown;
}
export declare function matchPath(pattern: string, path: string): boolean;
export declare function findBestMatch<T extends PathAuthRule>(rules: T[] | null | undefined, path: string): T | null;
export declare function validatePathAuth(pathAuth: unknown): void;
declare const _default: {
    matchPath: typeof matchPath;
    findBestMatch: typeof findBestMatch;
    validatePathAuth: typeof validatePathAuth;
};
export default _default;
//# sourceMappingURL=path-matcher.d.ts.map