import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { extractColors } from '../lib/extractors/colors.js';
import { hslChroma } from '../lib/colors.js';
import { generateDesignMd } from '../lib/formatters/markdown.js';
import type { SemanticEvidence } from '../lib/types.js';

const BRAND = '#1d3a8a';
const ORANGE = '#e8590c';
const INK = '#111111';

const page = (head: string, body: string) =>
  `<!doctype html><html><head><style>${head}</style></head><body style="margin:0;background:#ffffff;color:${INK}">${body}</body></html>`;

const ELECTED = page(
  `:root{--brand:${BRAND}}`,
  Array.from({ length: 3 }, () => `<button class="btn-primary" style="background:${BRAND};color:#fff">Buy</button>`).join('') +
  Array.from({ length: 4 }, () => `<a class="brand-mark" style="color:${ORANGE}">mark</a>`).join(''),
);

const MONOCHROME = page(
  '',
  Array.from({ length: 6 }, () => `<p style="color:${INK}">text</p>`).join('') +
  Array.from({ length: 4 }, () => `<div class="col" style="background:#f4f4f4">x</div>`).join(''),
);

let browser: Browser | null = null;
let launchError: unknown = null;

before(async () => {
  try { browser = await chromium.launch(); } catch (e) { launchError = e; }
});

after(async () => { await browser?.close().catch(() => {}); });

async function evidenceFor(html: string): Promise<{ primary: string | undefined; evidence: SemanticEvidence }> {
  const p = await browser!.newPage();
  try {
    await p.setContent(html, { waitUntil: 'load' });
    const { semantic, semanticEvidence } = await extractColors(p);
    return { primary: semantic.primary, evidence: semanticEvidence.primary };
  } finally {
    await p.close().catch(() => {});
  }
}

function browserUnavailable(t: { skip: (m?: string) => void }): boolean {
  if (launchError) { t.skip(`chromium unavailable: ${launchError}`); return true; }
  return false;
}

test('an elected primary names its rule, reason and declaring token', async (t) => {
  if (browserUnavailable(t)) return;
  const { primary, evidence } = await evidenceFor(ELECTED);
  assert.ok(primary, 'primary should be elected');
  assert.equal(evidence.decision, 'elected');
  assert.equal(evidence.rule, 'class');
  assert.equal(evidence.reason, 'an element class names it primary');
  assert.deepEqual(evidence.tokens, ['--brand']);
});

test('alternates are the chromatic runners-up and never the winner', async (t) => {
  if (browserUnavailable(t)) return;
  const { evidence } = await evidenceFor(ELECTED);
  const colors = evidence.alternates.map((a) => a.color);
  assert.ok(colors.includes(ORANGE), `expected ${ORANGE} among ${colors.join(' ')}`);
  assert.ok(!colors.includes(BRAND), 'the elected colour is not its own alternate');
  for (const a of evidence.alternates) assert.ok(a.count > 0 && Array.isArray(a.sources));
});

test('a monochrome page refuses the primary and says why', async (t) => {
  if (browserUnavailable(t)) return;
  const { primary, evidence } = await evidenceFor(MONOCHROME);
  assert.equal(primary, undefined);
  assert.equal(evidence.decision, 'refused');
  assert.equal(evidence.rule, null);
  assert.equal(evidence.reason, 'no chromatic colour reached the palette');
  assert.deepEqual(evidence.alternates, []);
  assert.deepEqual(evidence.tokens, []);
});

test('hslChroma is zero for greys and the lightness extremes, positive for a brand hue', () => {
  assert.equal(hslChroma('#808080'), 0);
  assert.equal(hslChroma('#050505'), 0);
  assert.equal(hslChroma('#fafafa'), 0);
  assert.equal(hslChroma('not a hex'), 0);
  assert.ok(hslChroma(BRAND) > 0.15);
  assert.ok(hslChroma(ORANGE) > 0.15);
});

test('DESIGN.md carries the election reason and a refusal', () => {
  const base = { url: 'https://example.test', typography: { styles: [] }, components: {} };
  const elected = generateDesignMd({
    ...base,
    colors: {
      palette: [{ color: BRAND, normalized: BRAND, count: 3, confidence: 'high' }],
      semantic: { primary: BRAND },
      semanticEvidence: { primary: { decision: 'elected', rule: 'class', reason: 'an element class names it primary', tokens: ['--brand'], alternates: [] } },
      cssVariables: {},
    },
  } as never);
  assert.match(elected, /\*\*Primary\*\* \(#1D3A8A\): Elected: an element class names it primary \(--brand\)\./);

  const refused = generateDesignMd({
    ...base,
    colors: {
      palette: [{ color: INK, normalized: INK, count: 6, confidence: 'high' }],
      semantic: { text: INK },
      semanticEvidence: { primary: { decision: 'refused', rule: null, reason: '2 chromatic logo colours of equal weight, none painted as a surface', tokens: [], alternates: [{ color: '#00b6ff', count: 10, sources: ['logo'] }, { color: '#ff7237', count: 10, sources: ['logo'] }] } },
      cssVariables: {},
    },
  } as never);
  assert.match(refused, /\*\*Primary\*\*: not elected, 2 chromatic logo colours of equal weight, none painted as a surface\. Candidates: #00b6ff, #ff7237\./);
});

test('occurrences count each colour per paint, with fill area and the declaring token', async (t) => {
  if (browserUnavailable(t)) return;
  const p = await browser!.newPage();
  try {
    await p.setContent(ELECTED, { waitUntil: 'load' });
    const { occurrences, palette } = await extractColors(p);
    const brandFill = occurrences.find((o) => o.hex === BRAND && o.paints === 'fill');
    const orangeText = occurrences.find((o) => o.hex === ORANGE && o.paints === 'text');
    assert.ok(brandFill && orangeText, `expected fill and text rows, got ${JSON.stringify(occurrences)}`);
    assert.equal(brandFill.count, 3);
    assert.ok(brandFill.area > 0);
    assert.equal(brandFill.cssVar, '--brand');
    assert.equal(orangeText.count, 4);
    assert.equal(orangeText.area, 0);
    assert.equal(orangeText.cssVar, null);
    assert.ok(occurrences.every((o) => o.slot === null && o.state === null));
    assert.ok(!occurrences.some((o) => o.hex === BRAND && o.paints === 'text'));
    for (const c of palette) assert.ok(occurrences.some((o) => o.hex === c.normalized), `${c.normalized} in palette but not in occurrences`);
  } finally {
    await p.close().catch(() => {});
  }
});
