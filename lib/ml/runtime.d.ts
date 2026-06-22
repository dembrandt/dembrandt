import { type Extraction, type Candidate } from './features.js';
export interface ScoredCandidate extends Candidate {
    score: number;
}
export interface ModelMeta {
    task: string;
    featureVersion?: number | null;
    featureNames: string[];
    trainedAt?: string;
    metrics?: Record<string, number>;
}
export declare function modelMeta(): ModelMeta | null;
/** Score every palette candidate. Returns them sorted best-first. */
export declare function scorePalette(extraction: Extraction, opts?: {
    modelPath?: string;
}): Promise<ScoredCandidate[]>;
/** All candidates the model considers brand colors (score >= min), best-first. */
export declare function brandColors(extraction: Extraction, opts?: {
    modelPath?: string;
    min?: number;
}): Promise<ScoredCandidate[]>;
/** Convenience: the single best candidate hex, or null if palette is empty. */
export declare function predictPrimary(extraction: Extraction, opts?: {
    modelPath?: string;
}): Promise<{
    hex: string;
    score: number;
} | null>;
