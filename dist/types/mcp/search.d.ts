export declare class SearchService {
    private coreDocs;
    private pluginDocs;
    private coreFuse;
    private pluginFuse;
    constructor();
    private loadData;
    private _cosineSimilarity;
    searchCore(query: string, limit?: number): Promise<{
        embedding: undefined;
        id: string;
        path: string;
        title: string;
        category: string;
        content: string;
        score: number | undefined;
    }[]>;
    searchPlugins(query: string, limit?: number): Promise<{
        embedding: undefined;
        id: string;
        path: string;
        title: string;
        category: string;
        content: string;
        score: number | undefined;
    }[]>;
}
//# sourceMappingURL=search.d.ts.map