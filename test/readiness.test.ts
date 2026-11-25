import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { isContentMutation, settleScript, waitForSettled } from '../lib/readiness.js';

test('added nodes and text changes are content', () => {
  assert.equal(isContentMutation({ type: 'childList' }), true);
  assert.equal(isContentMutation({ type: 'characterData' }), true);
});

test('class, src, href, hidden and data-theme changes are content', () => {
  for (const attributeName of ['class', 'src', 'href', 'hidden', 'data-theme']) {
    assert.equal(isContentMutation({ type: 'attributes', attributeName }), true, attributeName);
  }
});

test('inline style and other attribute changes are not content', () => {
  for (const attributeName of ['style', 'aria-expanded', 'x', null]) {
    assert.equal(isContentMutation({ type: 'attributes', attributeName }), false, String(attributeName));
  }
});

test('the page script is a self-contained expression', () => {
  const script = settleScript(400, 1000);
  assert.doesNotThrow(() => new Function(`return ${script}`));
  assert.match(script, /, 400, 1000\)$/);
});

let browser: Browser | null = null;
let page: Page | null = null;

before(async () => { browser = await chromium.launch(); page = await browser.newPage(); });
after(async () => { await browser?.close(); });

const animated = `<div id="a"></div><script>
  let i = 0; setInterval(() => { document.getElementById('a').style.transform = 'translateX(' + (i++ % 50) + 'px)'; }, 30);
</script>`;

test('a page that only animates inline styles settles on quiet, not at the cap', async () => {
  await page!.setContent(`<!doctype html><body>${animated}</body>`);
  const phase = await waitForSettled(page!, 3000, 300);
  assert.equal(phase.endedBy, 'quiet');
  assert.ok(phase.ms < 1500, `took ${phase.ms}ms`);
});

test('a page that keeps adding nodes runs to the cap', async () => {
  await page!.setContent(`<!doctype html><body><ul id="l"></ul><script>
    setInterval(() => document.getElementById('l').append(document.createElement('li')), 100);
  </script></body>`);
  const phase = await waitForSettled(page!, 1500, 300);
  assert.equal(phase.endedBy, 'cap');
  assert.ok(phase.ms >= 1400, `took ${phase.ms}ms`);
});

test('class changes during the quiet window extend it', async () => {
  await page!.setContent(`<!doctype html><body>${animated}</body>`);
  const end = await page!.evaluate(`(() => {
    setTimeout(() => document.body.classList.add('late'), 200);
    setTimeout(() => document.body.classList.add('later'), 450);
    return ${settleScript(300, 3000)};
  })()`);
  assert.equal(end, 'quiet');
  assert.equal(await page!.evaluate(() => document.body.className), 'late later');
});

test('a wait that cannot run ends as an error', async () => {
  const closed = await browser!.newPage();
  await closed.close();
  assert.equal((await waitForSettled(closed, 500, 100)).endedBy, 'error');
  await page!.setContent('<p>x</p>');
  await page!.evaluate(() => document.documentElement.remove());
  assert.equal(await page!.evaluate(settleScript(100, 500)), 'error');
});

test('no timer outlives the wait', async () => {
  const closed = await browser!.newPage();
  await closed.close();
  const timers = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
  const before = timers();
  await waitForSettled(closed, 60000, 100);
  assert.equal(timers(), before);
});
