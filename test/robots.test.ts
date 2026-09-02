import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkRobotsTxt, evaluatePath, fetchRobotsRules, filterAllowedUrls } from '../lib/robots.js';

function withMockFetch<T>(body: string | null, status: number, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    body === null
      ? Promise.reject(new Error('network error'))
      : { ok: status >= 200 && status < 300, text: async () => body }) as unknown as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test('evaluatePath: a disallow rule blocks the matching path', () => {
  assert.deepEqual(evaluatePath([{ type: 'disallow', value: '/admin' }], '/admin/users'), {
    allowed: false,
    rule: '/admin',
  });
});

test('evaluatePath: no matching rule allows by default', () => {
  assert.deepEqual(evaluatePath([{ type: 'disallow', value: '/admin' }], '/pricing'), {
    allowed: true,
    rule: null,
  });
});

test('evaluatePath: the longest matching rule wins regardless of order', () => {
  const rules = [
    { type: 'disallow' as const, value: '/checkout' },
    { type: 'allow' as const, value: '/checkout/status' },
  ];
  assert.deepEqual(evaluatePath(rules, '/checkout/status'), { allowed: true, rule: '/checkout/status' });
  assert.deepEqual(evaluatePath(rules, '/checkout/pay'), { allowed: false, rule: '/checkout' });
});

test('evaluatePath: wildcard and end-anchor patterns match correctly', () => {
  assert.deepEqual(evaluatePath([{ type: 'disallow', value: '/sources/*' }], '/sources/abc'), {
    allowed: false,
    rule: '/sources/*',
  });
  assert.deepEqual(evaluatePath([{ type: 'disallow', value: '/handoff$' }], '/handoff/extra'), {
    allowed: true,
    rule: null,
  });
});

test('fetchRobotsRules: parses the matching user-agent group', async () => {
  const body = 'User-agent: Dembrandt\nDisallow: /private\n\nUser-agent: *\nDisallow: /\n';
  const rules = await withMockFetch(body, 200, () => fetchRobotsRules('https://example.com/'));
  assert.equal(rules.status, 'ok');
  if (rules.status === 'ok') {
    assert.deepEqual(rules.rules, [{ type: 'disallow', value: '/private' }]);
  }
});

test('fetchRobotsRules: falls back to * when there is no Dembrandt-specific group', async () => {
  const body = 'User-agent: *\nDisallow: /admin\n';
  const rules = await withMockFetch(body, 200, () => fetchRobotsRules('https://example.com/'));
  assert.equal(rules.status, 'ok');
  if (rules.status === 'ok') assert.deepEqual(rules.rules, [{ type: 'disallow', value: '/admin' }]);
});

test('fetchRobotsRules: unavailable on a non-2xx response or network failure', async () => {
  assert.deepEqual(await withMockFetch('', 404, () => fetchRobotsRules('https://example.com/')), { status: 'unavailable' });
  assert.deepEqual(await withMockFetch(null, 0, () => fetchRobotsRules('https://example.com/')), { status: 'unavailable' });
});

test('checkRobotsTxt: evaluates the target path against the fetched rules', async () => {
  const body = 'User-agent: *\nDisallow: /admin\n';
  const result = await withMockFetch(body, 200, () => checkRobotsTxt('https://example.com/admin/users'));
  assert.deepEqual(result, { status: 'ok', robotsUrl: 'https://example.com/robots.txt', allowed: false, rule: '/admin' });
});

test('filterAllowedUrls: splits urls by robots decision', () => {
  const rules = { status: 'ok' as const, robotsUrl: 'https://example.com/robots.txt', rules: [{ type: 'disallow' as const, value: '/admin' }] };
  const { allowed, disallowed } = filterAllowedUrls(
    ['https://example.com/pricing', 'https://example.com/admin/users'],
    rules,
  );
  assert.deepEqual(allowed, ['https://example.com/pricing']);
  assert.deepEqual(disallowed, [{ url: 'https://example.com/admin/users', rule: '/admin' }]);
});

test('filterAllowedUrls: an unavailable robots.txt allows everything through', () => {
  const { allowed, disallowed } = filterAllowedUrls(['https://example.com/anything'], { status: 'unavailable' });
  assert.deepEqual(allowed, ['https://example.com/anything']);
  assert.deepEqual(disallowed, []);
});

test('filterAllowedUrls: a malformed URL is passed through rather than dropped', () => {
  const rules = { status: 'ok' as const, robotsUrl: 'https://example.com/robots.txt', rules: [] };
  const { allowed, disallowed } = filterAllowedUrls(['not a url'], rules);
  assert.deepEqual(allowed, ['not a url']);
  assert.deepEqual(disallowed, []);
});
