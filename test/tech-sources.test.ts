import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { detectFrameworks, detectIconSystem, watchTechSources } from '../lib/tech/index.js';
import { emptyFacts, scanSource } from '../lib/tech/sources.js';

const scan = (text: string, patterns = [{ key: 'k', pattern: /version:"(\d+\.\d+\.\d+)",marker/ }]) => {
  const facts = emptyFacts();
  scanSource(text, patterns, facts);
  return facts;
};

test('a licence comment yields the line that names a version', () => {
  assert.deepEqual(scan('/*! jQuery v3.7.1 | (c) OpenJS Foundation | jquery.org/license */var a=1;').banners, ['jQuery v3.7.1 | (c) OpenJS Foundation | jquery.org/license']);
  assert.deepEqual(scan('/*!\n * Bootstrap v5.3.8 (https://getbootstrap.com/)\n * Copyright 2011-2025 The Bootstrap Authors\n */').banners, ['Bootstrap v5.3.8 (https://getbootstrap.com/)']);
});

test('a bundler block that stacks licences yields one banner per library', () => {
  const block = '/*! Bundled license information:\n\njquery/dist/jquery.js:\n  (*! jQuery JavaScript Library v3.7.1 *)\n\nlucide-react/dist/esm/lucide-react.js:\n  (**\n   * @license lucide-react v0.577.0 - ISC\n   *)\n*/';
  assert.deepEqual(scan(block).banners, ['jQuery JavaScript Library v3.7.1', 'lucide-react v0.577.0 - ISC']);
});

test('the same library named twice is kept once, and comments without a version are ignored', () => {
  assert.deepEqual(scan('/*! Semantic UI 2.5.0 - Reset */a{}/*! Semantic UI 2.5.0 - Site */b{}/* just a note */').banners, ['Semantic UI 2.5.0 - Reset']);
  assert.deepEqual(scan('/* TODO: fix this later */ /* eslint-disable */').banners, []);
});

test('a code pattern captures the first version it finds and keeps it', () => {
  const facts = scan('x={version:"3.14.1",marker:1}');
  assert.equal(facts.code.k, '3.14.1');
  scanSource('y={version:"9.9.9",marker:1}', [{ key: 'k', pattern: /version:"(\d+\.\d+\.\d+)",marker/ }], facts);
  assert.equal(facts.code.k, '3.14.1');
});

test('a file of unterminated comment openers is scanned in linear time', () => {
  const started = Date.now();
  assert.deepEqual(scan('/*'.repeat(1_500_000)).banners, []);
  assert.deepEqual(scan(`${'/* x '.repeat(400_000)}*/ /*! jQuery v3.7.1 */`).banners, ['jQuery v3.7.1']);
  assert.ok(Date.now() - started < 2000);
});

let browser: Browser | null = null;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

async function visit(files: Record<string, { type: string; body: string }>) {
  const page = await browser!.newPage();
  await watchTechSources(page);
  await page.route('https://site.test/**', (route) => {
    const file = files[new URL(route.request().url()).pathname];
    return file ? route.fulfill({ contentType: file.type, body: file.body }) : route.fulfill({ status: 404, body: '' });
  });
  await page.goto('https://site.test/');
  return page;
}

test('a version written only in a hashed stylesheet is recovered', async () => {
  const page = await visit({
    '/': { type: 'text/html', body: '<!doctype html><html><head><link rel="stylesheet" href="/assets/a1b2c3.css"></head><body><div class="btn btn-primary">x</div><i class="fa-solid fa-star"></i></body></html>' },
    '/assets/a1b2c3.css': { type: 'text/css', body: '/*!\n * Bootstrap v5.3.3 (https://getbootstrap.com/)\n */.btn{color:red}/*!\n * Font Awesome Free 6.5.1 by @fontawesome\n */@font-face{font-family:"Font Awesome 6 Free";src:local("x")}' },
  });
  assert.equal((await detectFrameworks(page)).find((f) => f.name === 'Bootstrap')?.version, '5.3.3');
  assert.equal((await detectIconSystem(page)).find((i) => i.name === 'Font Awesome')?.version, '6.5.1');
});

test('a bundled React states its version through the renderer hook', async () => {
  const page = await visit({
    '/': { type: 'text/html', body: '<!doctype html><html><body><div id="root"><p>a</p><p>b</p></div><aside>c</aside><script src="/app.js"></script></body></html>' },
    '/app.js': { type: 'text/javascript', body: 'window.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject({ version: "19.1.0", rendererPackageName: "react-dom" }); document.getElementById("root").__reactContainer$abc = {};' },
  });
  const react = (await detectFrameworks(page)).find((f) => f.name === 'React');
  assert.equal(react?.version, '19.1.0');
  assert.equal(react?.coverage, 0.6);
});

test('a page that was never watched still detects from the DOM', async () => {
  const page = await browser!.newPage();
  await page.setContent('<!doctype html><html><body><div ng-version="17.3.0"></div></body></html>');
  assert.equal((await detectFrameworks(page)).find((f) => f.name === 'Angular')?.version, '17.3.0');
});
