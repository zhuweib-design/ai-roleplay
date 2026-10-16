/** 由 scripts/e2e-shard-groups.mjs 生成，请勿手改（与 shard-groups.mjs 同版本） */
export declare const E2E_GROUPS: string[][];
export declare const MEASURED_AT: string;
export declare const SOURCE_COMMIT: string;
export declare const MEASURED_CASES: number;
export declare const MEASURED_TOTAL_SEC: number;
export declare const SPEC_WEIGHTS: Record<string, number>;
export declare function groupFiles(n: number): string[];
export declare function groupWeights(): { sums: number[]; spread: number };
