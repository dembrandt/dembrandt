import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { extractMotion, extractMotionStatic, FREEZE_STYLE_ID } from '../lib/extractors/breakpoints.js';

// The orchestrator freezes every animation to 1ms for determinism. Motion is
// the one extractor whose values that freeze destroys, so the static pass has
// to be taken before it. These fixtures pin both halves of that contract.

const FIXTURE = `<!doctype html><html><head><style>
  a { color: #333; transition: color 0.2s ease-in-out; }
  button { background: #eee; transition: background-color 0.15s ease; }
</style></head><body>
<a href="#">Link</a>
<button>Press</button>
</body></html>`;

const FREEZE_CSS = `*, *::before, *::after {
  animation-duration: 1ms !important;
  transition-duration: 1ms !important;
}`;

let browser: Browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close().catch(() => {}); });

async function freeze(page) {
  await page.evaluate(([id, css]) => {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }, [FREEZE_STYLE_ID, FREEZE_CSS]);
}

test('a snapshot taken before the freeze keeps the authored durations', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(FIXTURE);
    const snapshot = await extractMotionStatic(page);
    await freeze(page);

    const motion = await extractMotion(page, snapshot);
    const values = motion.durations.map((d: { value: string }) => d.value);
    assert.ok(values.includes('0.2s'), `expected 0.2s, got ${values.join(', ')}`);
    assert.ok(values.includes('0.15s'), `expected 0.15s, got ${values.join(', ')}`);
    assert.equal(motion.contexts.link.durations[0], '0.2s');
  } finally {
    await page.close();
  }
});

test('reading a frozen page reports the freeze, not the design', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(FIXTURE);
    await freeze(page);

    const motion = await extractMotion(page);
    const values = motion.durations.map((d: { value: string }) => d.value);
    assert.deepEqual(values, ['0.001s']);
  } finally {
    await page.close();
  }
});
