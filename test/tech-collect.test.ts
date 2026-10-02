import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { collectTechSignals, detectFrameworks, detectIconSystem, PROBES } from '../lib/tech/index.js';

let browser: Browser | null = null;
let page: Page | null = null;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

async function load(html: string) {
  page = await browser!.newPage();
  await page.setContent(html);
  return page;
}

const sample = `<!doctype html><html><head><meta name="generator" content="Astro v5.1.0">
<style>:root { --bs-blue: #00f; --bs-red: #f00; } @font-face { font-family: "Font Awesome 6 Free"; src: local("x"); } @layer theme, base; .col-xs-12 { width: 100%; } .btn-default { color: red; }</style></head>
<body><div id="root" class="btn btn-primary btn" data-bs-toggle="collapse"><!--marker--><i class="fa-solid fa-star"></i><svg class="nav-icon" viewBox="0 0 24 24" fill="none"></svg></div>
<script id="__DATA__" type="application/json">{}</script>
<script>window.jQuery = { fn: { jquery: "3.7.1" } }; window.plain = 1; document.getElementById("root").__reactFiber$abc123 = {};</script></body></html>`;

test('the collector reports what the page carries', async () => {
  const s = await collectTechSignals(await load(sample), PROBES);
  assert.equal(s.classes.btn, 1);
  assert.equal(s.classes['btn-primary'], 1);
  assert.equal(s.attrs['data-bs-toggle'], 1);
  assert.deepEqual(s.attrValues['data-bs-toggle'], ['collapse']);
  assert.equal(s.globals.jQuery, '3.7.1');
  assert.equal(s.globals.plain, '');
  assert.ok(!('document' in s.globals));
  assert.ok(s.props.includes('__reactFiber$'));
  assert.deepEqual(s.generators, ['Astro v5.1.0']);
  assert.equal(s.cssVars['--bs-'], 2);
  assert.ok(s.fontFaces.includes('Font Awesome 6 Free'));
  assert.deepEqual(s.cssLayers, ['theme', 'base']);
  assert.ok(s.cssClasses.includes('col-xs-12'));
  assert.ok(s.comments.includes('marker'));
  assert.ok(s.scripts.includes('__DATA__|application/json'));
  assert.equal(s.svgs['0 0 24 24||none|'], 1);
  assert.equal(s.svgs['class~icon'], 1);
});

test('frameworks and icon systems come from one page read', async () => {
  const p = await load(sample);
  const frameworks = await detectFrameworks(p);
  const icons = await detectIconSystem(p);
  const jquery = frameworks.find((f) => f.name === 'jQuery');
  assert.equal(jquery?.version, '3.7.1');
  assert.equal(jquery?.category, 'js-library');
  assert.ok(frameworks.some((f) => f.name === 'React'));
  assert.ok(frameworks.every((f) => f.category !== 'icon-set'));
  assert.deepEqual(icons.find((i) => i.name === 'Font Awesome'), { name: 'Font Awesome', type: 'icon-font', version: '6' });
  assert.ok(icons.some((i) => i.name === 'SVG Icons'));
});

test('open shadow roots are read, and a mount element states its framework version', async () => {
  const p = await load(`<!doctype html><html><body><div id="app"><p>a</p></div><x-card></x-card><script>
    const host = document.querySelector('x-card');
    host.attachShadow({ mode: 'open' }).innerHTML = '<style>:host { --sl-color: red; }</style><span class="inner-part"></span>';
    document.getElementById('app').__vue_app__ = { version: '3.4.21' };
  </script></body></html>`);
  const s = await collectTechSignals(p, PROBES);
  assert.equal(s.shadowRoots, 1);
  assert.equal(s.classes['inner-part'], 1);
  assert.equal(s.cssVars['--sl-'], 1);
  assert.equal(s.globals['dom:vue'], '3.4.21');
  assert.equal(s.roots.Vue, 0.5);
});

test('an empty page yields empty results rather than throwing', async () => {
  const p = await load('<!doctype html><html><body></body></html>');
  assert.deepEqual(await detectFrameworks(p), []);
  assert.deepEqual(await detectIconSystem(p), []);
});
