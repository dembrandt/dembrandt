// runtime.ts — fast inference for end users. Loads the bundled ONNX model and
// scores a dembrandt extraction's palette. This is what dembrandt imports.
//
//   import { predictPrimary, scorePalette } from 'dembrandt-ml';
//   const best = await predictPrimary(extraction);
import * as ort from 'onnxruntime-node';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { candidatesFrom, FEATURE_DIM, FEATURE_VERSION } from './features.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
// model/ sits next to the package root (dist/ is one level under root).
const MODEL_PATH = resolve(__dirname, 'model.onnx');
const META_PATH = resolve(__dirname, 'meta.json');
let sessionPromise = null;
function getSession(modelPath = MODEL_PATH) {
    if (!existsSync(modelPath)) {
        throw new Error(`dembrandt-ml: model not found at ${modelPath}. Train one with \`npm run train\`.`);
    }
    if (!sessionPromise)
        sessionPromise = ort.InferenceSession.create(modelPath);
    return sessionPromise;
}
export function modelMeta() {
    if (!existsSync(META_PATH))
        return null;
    return JSON.parse(readFileSync(META_PATH, 'utf-8'));
}
// Refuse a model trained against a different feature version than this code.
// Throwing here lets the caller (dembrandt) fall back to its heuristic instead of
// feeding mismatched features into the model. Checked once, then memoized.
let compatChecked = false;
function assertCompatible() {
    if (compatChecked)
        return;
    const meta = modelMeta();
    if (meta && meta.featureVersion != null && meta.featureVersion !== FEATURE_VERSION) {
        throw new Error(`dembrandt-ml: model feature version ${meta.featureVersion} != code ${FEATURE_VERSION}. ` +
            `Retrain (npm run dataset && npm run train).`);
    }
    compatChecked = true;
}
/** Score every palette candidate. Returns them sorted best-first. */
export async function scorePalette(extraction, opts = {}) {
    if (!extraction || !extraction.colors) return [];
    const candidates = candidatesFrom(extraction);
    if (candidates.length === 0)
        return [];
    assertCompatible();
    const session = await getSession(opts.modelPath);
    const n = candidates.length;
    const flat = new Float32Array(n * FEATURE_DIM);
    candidates.forEach((c, i) => flat.set(c.features, i * FEATURE_DIM));
    const input = new ort.Tensor('float32', flat, [n, FEATURE_DIM]);
    const inputName = session.inputNames[0];
    const results = await session.run({ [inputName]: input });
    const probs = pickProbabilities(results, n);
    const scored = candidates.map((c, i) => ({ ...c, score: probs[i] }));
    scored.sort((a, b) => b.score - a.score);
    return scored;
}
/** All candidates the model considers brand colors (score >= min), best-first. */
export async function brandColors(extraction, opts = {}) {
    const min = opts.min ?? 0.5;
    const scored = await scorePalette(extraction, opts);
    return scored.filter((c) => c.score >= min);
}
/** Convenience: the single best candidate hex, or null if palette is empty. */
export async function predictPrimary(extraction, opts = {}) {
    const scored = await scorePalette(extraction, opts);
    if (scored.length === 0)
        return null;
    return { hex: scored[0].hex, score: scored[0].score };
}
// skl2onnx (zipmap=False) emits a [N,2] float "probabilities" tensor; some
// configs name it differently, so find the float tensor with 2 columns.
function pickProbabilities(results, n) {
    for (const name of Object.keys(results)) {
        const t = results[name];
        if (t.type === 'float32' && t.data.length === n * 2) {
            const d = t.data;
            const out = [];
            for (let i = 0; i < n; i++)
                out.push(d[i * 2 + 1]); // P(class=1)
            return out;
        }
    }
    // fallback: single-column score
    for (const name of Object.keys(results)) {
        const t = results[name];
        if (t.type === 'float32' && t.data.length === n) {
            return Array.from(t.data);
        }
    }
    throw new Error('dembrandt-ml: could not locate probability output in model results');
}
