import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAgainstRules, checkRobotsTxt, evaluatePath, fetchRobotsRules, filterAllowedUrls, robotsAgentFor, robotsVerdict } from '../lib/robots.js';

function withMockFetch<T>(body: string | null, status: number, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    body === null
      ? Promise.reject(new Error('network error'))
      : { ok: status >= 200 && status < 300, status, text: async () => body }) as unknown as typeof fetch;
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
  const rules = await withMockFetch(body, 200, () =>
    fetchRobotsRules('https://example.com/', { agent: 'Dembrandt' }));
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

test('fetchRobotsRules: absent on 4xx, unavailable on 5xx or a network failure', async () => {
  assert.deepEqual(await withMockFetch('', 404, () => fetchRobotsRules('https://example.com/')), { status: 'absent' });
  assert.deepEqual(await withMockFetch('', 410, () => fetchRobotsRules('https://example.com/')), { status: 'absent' });
  assert.deepEqual(await withMockFetch('', 500, () => fetchRobotsRules('https://example.com/')), { status: 'unavailable' });
  assert.deepEqual(await withMockFetch(null, 0, () => fetchRobotsRules('https://example.com/')), { status: 'unavailable' });
});

test('checkRobotsTxt: evaluates the target path against the fetched rules', async () => {
  const body = 'User-agent: *\nDisallow: /admin\n';
  const result = await withMockFetch(body, 200, () => checkRobotsTxt('https://example.com/admin/users'));
  assert.deepEqual(result, { status: 'ok', robotsUrl: 'https://example.com/robots.txt', allowed: false, rule: '/admin' });
});

test('filterAllowedUrls: splits urls by robots decision', () => {
  const rules = { status: 'ok' as const, robotsUrl: 'https://example.com/robots.txt', sitemaps: [], rules: [{ type: 'disallow' as const, value: '/admin' }] };
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
  const rules = { status: 'ok' as const, robotsUrl: 'https://example.com/robots.txt', sitemaps: [], rules: [] };
  const { allowed, disallowed } = filterAllowedUrls(['not a url'], rules);
  assert.deepEqual(allowed, ['not a url']);
  assert.deepEqual(disallowed, []);
});

test('fetchRobotsRules: an HTML body is treated as unavailable, not as an empty rule set', async () => {
  const body = '<!DOCTYPE html>\n<html><body>Access denied</body></html>';
  const result = await withMockFetch(body, 200, () => fetchRobotsRules('https://example.com/'));
  assert.equal(result.status, 'unavailable');
});

test('fetchRobotsRules: matches the group for the requested agent', async () => {
  const body = 'User-agent: Dembrandt\nDisallow: /named\n\nUser-agent: *\nDisallow: /everyone\n';
  const named = await withMockFetch(body, 200, () =>
    fetchRobotsRules('https://example.com/', { agent: 'Dembrandt' }));
  assert.deepEqual(named, {
    status: 'ok',
    robotsUrl: 'https://example.com/robots.txt',
    sitemaps: [],
    rules: [{ type: 'disallow', value: '/named' }],
  });
});

test('fetchRobotsRules: an unnamed run falls under the wildcard group, not the Dembrandt one', async () => {
  const body = 'User-agent: Dembrandt\nAllow: /\n\nUser-agent: *\nDisallow: /\n';
  const result = await withMockFetch(body, 200, () => fetchRobotsRules('https://example.com/'));
  assert.deepEqual(result, {
    status: 'ok',
    robotsUrl: 'https://example.com/robots.txt',
    sitemaps: [],
    rules: [{ type: 'disallow', value: '/' }],
  });
});

test('checkRobotsTxt: forwards the agent to the group match', async () => {
  const body = 'User-agent: Dembrandt\nDisallow: /admin\n\nUser-agent: *\nAllow: /\n';
  const result = await withMockFetch(body, 200, () =>
    checkRobotsTxt('https://example.com/admin', { agent: 'Dembrandt' }));
  assert.deepEqual(result, {
    status: 'ok',
    robotsUrl: 'https://example.com/robots.txt',
    allowed: false,
    rule: '/admin',
  });
});

test('robotsVerdict: a user-driven run is warned and proceeds, an enforcing run refuses', () => {
  const disallowed = { status: 'ok', robotsUrl: 'https://example.com/robots.txt', allowed: false, rule: '/' } as const;

  assert.deepEqual(robotsVerdict(disallowed, { enforce: false }), {
    action: 'warn',
    reason: 'robots.txt disallows this path (rule: "/")',
    rule: '/',
  });
  assert.equal(robotsVerdict(disallowed, { enforce: true }).action, 'refuse');
});

test('robotsVerdict: an unreadable robots.txt fails open for a user and closed when enforcing', () => {
  const unavailable = { status: 'unavailable', robotsUrl: 'https://example.com/robots.txt' } as const;

  assert.deepEqual(robotsVerdict(unavailable, { enforce: false }), { action: 'proceed' });
  assert.deepEqual(robotsVerdict(unavailable, { enforce: true }), {
    action: 'refuse',
    reason: 'robots.txt could not be read',
  });
});

test('robotsVerdict: an allowed path proceeds either way', () => {
  const allowed = { status: 'ok', robotsUrl: 'https://example.com/robots.txt', allowed: true, rule: null } as const;

  assert.deepEqual(robotsVerdict(allowed, { enforce: false }), { action: 'proceed' });
  assert.deepEqual(robotsVerdict(allowed, { enforce: true }), { action: 'proceed' });
});

test('fetchRobotsRules: Sitemap directives come back with the rules, not a second fetch', () => {
  const body = 'Sitemap: https://example.com/sitemap.xml\nUser-agent: *\nDisallow: /admin\nSitemap: /relative-is-not-a-url\n';
  return withMockFetch(body, 200, async () => {
    const rules = await fetchRobotsRules('https://example.com/');
    assert.equal(rules.status, 'ok');
    if (rules.status === 'ok') {
      assert.deepEqual(rules.sitemaps, ['https://example.com/sitemap.xml']);
      assert.deepEqual(rules.rules, [{ type: 'disallow', value: '/admin' }]);
    }
  });
});

test('checkAgainstRules: evaluates a path against rules already fetched', () => {
  const rules = {
    status: 'ok' as const,
    robotsUrl: 'https://example.com/robots.txt',
    sitemaps: [],
    rules: [{ type: 'disallow' as const, value: '/admin' }],
  };

  assert.deepEqual(checkAgainstRules('https://example.com/admin/users', rules), {
    status: 'ok',
    robotsUrl: 'https://example.com/robots.txt',
    allowed: false,
    rule: '/admin',
  });
  assert.equal(checkAgainstRules('https://example.com/pricing', rules).status === 'ok', true);
  assert.equal(checkAgainstRules('https://example.com/x', { status: 'unavailable' }).status, 'unavailable');
});

test('a missing robots.txt is not the same as one we could not read', async () => {
  const absent = await withMockFetch('', 404, () => fetchRobotsRules('https://example.com/'));
  assert.equal(absent.status, 'absent');
  assert.deepEqual(robotsVerdict(checkAgainstRules('https://example.com/', absent), { enforce: true }), {
    action: 'proceed',
  });

  const unreadable = await withMockFetch('', 503, () => fetchRobotsRules('https://example.com/'));
  assert.equal(unreadable.status, 'unavailable');
  assert.equal(
    robotsVerdict(checkAgainstRules('https://example.com/', unreadable), { enforce: true }).action,
    'refuse',
  );
});

test('a refusal or a rate limit is unreadable, not absent', async () => {
  for (const status of [401, 403, 418, 429]) {
    const refused = await withMockFetch('', status, () => fetchRobotsRules('https://example.com/'));
    assert.equal(refused.status, 'unavailable', `status ${status}`);
    assert.equal(
      robotsVerdict(checkAgainstRules('https://example.com/', refused), { enforce: true }).action,
      'refuse',
    );
  }
});

test('robotsAgentFor: the group we match follows the User-Agent we send', () => {
  assert.equal(robotsAgentFor(undefined), '*');
  assert.equal(robotsAgentFor('Mozilla/5.0 (X11) Chrome/136.0.0.0 Safari/537.36'), '*');
  assert.equal(robotsAgentFor('Mozilla/5.0 Chrome/136 Dembrandt/0.32.1 (+https://dembrandt.com/bot)'), 'Dembrandt');
  assert.equal(robotsAgentFor('custom dembrandt runner'), 'Dembrandt');
});

test('filterAllowedUrls: an unreadable robots.txt allows nothing when the run enforces', () => {
  const urls = ['https://example.com/a', 'https://example.com/b'];

  assert.deepEqual(filterAllowedUrls(urls, { status: 'unavailable' }, { enforce: true }), {
    allowed: [],
    disallowed: [{ url: urls[0], rule: null }, { url: urls[1], rule: null }],
  });
  assert.deepEqual(filterAllowedUrls(urls, { status: 'unavailable' }, { enforce: false }), {
    allowed: urls,
    disallowed: [],
  });
  // The default is the advisory posture, so an omitted option never enforces.
  assert.deepEqual(filterAllowedUrls(urls, { status: 'unavailable' }), { allowed: urls, disallowed: [] });
  assert.deepEqual(filterAllowedUrls(urls, { status: 'absent' }, { enforce: true }), {
    allowed: urls,
    disallowed: [],
  });
});

test('filterAllowedUrls and robotsVerdict answer the same question the same way', () => {
  const url = 'https://example.com/x';
  for (const enforce of [true, false]) {
    for (const rules of [{ status: 'absent' } as const, { status: 'unavailable' } as const]) {
      const verdict = robotsVerdict(checkAgainstRules(url, rules), { enforce });
      const { allowed } = filterAllowedUrls([url], rules, { enforce });
      assert.equal(
        allowed.length === 1,
        verdict.action !== 'refuse',
        `${rules.status} under enforce=${enforce}`,
      );
    }
  }
});
