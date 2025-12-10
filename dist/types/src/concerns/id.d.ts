export declare function initializeNanoid(): Promise<void>;
export declare function getNanoidInitializationError(): Error | null;
export declare const idGenerator: (size?: number) => string;
export declare const passwordGenerator: (size?: number) => string;
export declare const getUrlAlphabet: () => string;
export declare const createCustomGenerator: (alphabet: string, size: number) => ((size?: number) => string);
//# sourceMappingURL=id.d.ts.map