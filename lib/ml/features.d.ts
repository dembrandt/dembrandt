export interface PaletteEntry {
    color?: string;
    normalized?: string;
    count?: number;
    confidence?: 'high' | 'medium' | 'low' | string;
    sources?: string[];
    source?: string;
    oklch?: string | null;
    lch?: string | null;
}
export interface Extraction {
    url?: string;
    colors?: {
        semantic?: Record<string, string | null>;
        palette?: PaletteEntry[];
        cssVariables?: Record<string, string | {
            value?: string;
        } | null> | null;
    };
}
export interface Candidate {
    hex: string;
    features: number[];
    count: number;
    sources: string[];
    rank: number;
}
export declare const FEATURE_NAMES: readonly ["usage_frac", "log_count", "confidence", "lightness", "chroma", "hue_sin", "hue_cos", "is_grayish", "is_near_black", "is_near_white", "n_sources", "src_button", "src_link", "src_nav", "src_logo", "src_hero", "src_cta", "src_brand", "src_header", "src_primary", "src_text", "src_bg", "is_root_token", "is_brand_token", "rank"];
export declare const FEATURE_DIM: 25;
export declare const FEATURE_VERSION = 1;
export declare function normHex(c?: string | null): string | null;
export declare function hexToOklch(hex: string): {
    L: number;
    C: number;
    H: number;
};
export declare function candidatesFrom(extraction: Extraction): Candidate[];
