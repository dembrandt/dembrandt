/**
 * Filename (without extension) for a page's per-page snapshot in .dembrandt/pages/.
 * Shared by init (writes them) and drift (reads them) so they always agree.
 *   "/"          -> "index"
 *   "/pricing"   -> "pricing"
 *   "/docs/api"  -> "docs_api"
 */
export declare function pageSnapshotName(pathOrUrl: any): any;
export declare function writeConfig(url: string, result: any, pages?: any[]): {
    configPath: string;
    tokensPath: string;
    snapshotPath: string;
    pagesDir: string;
    configExists: boolean;
    domain: any;
    tokens: Record<string, any>;
    baseline: string;
};
export declare function buildSnapshot(url: string, result: any): any;
export declare function buildSnapshotYaml(snapshot: any): string;
export declare function printInitSuccess({ configPath, tokensPath, snapshotPath, configExists, domain, tokens, baseline }: {
    configPath: any;
    tokensPath: any;
    snapshotPath: any;
    configExists: any;
    domain: any;
    tokens: any;
    baseline: any;
}): void;
