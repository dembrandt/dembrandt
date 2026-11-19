import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { extractColors } from '../lib/extractors/colors.js';

const BRAND = 'rgb(88, 204, 2)';
const TEXT = '#1cb0f6';

let browser: Browser | null = null;
let page: Page | null = null;

before(async () => { browser = await chromium.launch(); page = await browser.newPage(); });
after(async () => { await browser?.close(); });

async function primaryOf(body: string) {
  await page!.setContent(`<!doctype html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}` +
    `.x9{position:relative;display:inline-block;width:200px;height:48px;color:#fff;z-index:0}` +
    `.x9::before{content:"";position:absolute;inset:0;z-index:-1;background:${BRAND}}</style></head>` +
    `<body style="background:#ffffff">${body}</body></html>`);
  const result = await extractColors(page!);
  return { primary: String(result.semantic?.primary ?? ''), rule: result.semanticEvidence?.primary?.rule };
}

const links = Array.from({ length: 30 }, (_, i) => `<p><a href="/f${i}" style="color:${TEXT}">Footer ${i}</a></p>`).join('');
const accents = Array.from({ length: 3 }, () => `<h3 style="color:${BRAND}">Learn</h3>`).join('');
const buttons = (cls: string) => Array.from({ length: 3 }, () => `<a href="/go" class="${cls}">Get started</a>`).join('');

test('a button-sized link painted on ::before elects its fill over frequent text', async () => {
  const { primary, rule } = await primaryOf(buttons('x9') + accents + links);
  assert.equal(primary, BRAND);
  assert.equal(rule, 'cta');
});

test('a pseudo fill on an element that is not button-shaped is not a CTA', async () => {
  const { primary } = await primaryOf(`<a href="/" class="x9" style="width:1200px;height:400px">Hero</a>` + accents + links);
  assert.notEqual(primary, BRAND);
});
