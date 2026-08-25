import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_JOB_TTL_MS, JobQueue, resolveExtraction } from '../lib/mcp/jobs.js';
import type { JobResult } from '../lib/mcp/jobs.js';

type Extract = { url: string; colors?: unknown };

const identity = (d: Extract) => d;
const ok = (data: Extract): JobResult<Extract> => ({ ok: true, data });

/** A runner whose completion the test controls. */
function deferredRunner() {
  const started: string[] = [];
  const settle = new Map<string, (r: JobResult<Extract>) => void>();
  const run = (url: string) => {
    started.push(url);
    return new Promise<JobResult<Extract>>((resolve) => settle.set(url, resolve));
  };
  return { run, started, finish: (url: string, r: JobResult<Extract>) => settle.get(url)!(r) };
}

// ── lifecycle ──────────────────────────────────────────────────────────

test('a job runs and keeps both the sliced result and the whole extraction', async () => {
  const queue = new JobQueue<Extract>({ run: async () => ok({ url: 'https://x/', colors: { primary: '#000' } }) });
  const id = queue.enqueue('https://x/', {}, (d) => ({ colors: d.colors }));
  await queue.idle();

  const job = queue.get(id)!;
  assert.equal(job.status, 'completed');
  assert.deepEqual(job.result, { colors: { primary: '#000' } });
  assert.deepEqual(job.full, { url: 'https://x/', colors: { primary: '#000' } });
});

test('a failed extraction is reported as failed, not thrown', async () => {
  const queue = new JobQueue<Extract>({ run: async () => ({ ok: false, error: 'boom' }) });
  const id = queue.enqueue('https://x/', {}, identity);
  await queue.idle();

  assert.equal(queue.get(id)!.status, 'failed');
  assert.equal(queue.get(id)!.error, 'boom');
});

test('a runner that rejects fails the job instead of crashing the server', async () => {
  const queue = new JobQueue<Extract>({ run: async () => { throw new Error('launch failed'); } });
  const id = queue.enqueue('https://x/', {}, identity);
  await queue.idle();

  assert.equal(queue.get(id)!.status, 'failed');
  assert.equal(queue.get(id)!.error, 'launch failed');
});

test('a non-Error rejection still yields a readable message', async () => {
  const queue = new JobQueue<Extract>({ run: async () => { throw 'plain string'; } });
  const id = queue.enqueue('https://x/', {}, identity);
  await queue.idle();

  assert.equal(queue.get(id)!.error, 'plain string');
});

test('an unknown id reads back as null rather than throwing', () => {
  const queue = new JobQueue<Extract>({ run: async () => ok({ url: 'https://x/' }) });
  assert.equal(queue.get('nope'), null);
});

test('a job carries its own pick, so a second tool cannot reshape the first result', async () => {
  const queue = new JobQueue<Extract>({ run: async (url) => ok({ url: String(url) }) });
  const a = queue.enqueue('https://a/', {}, () => 'shape-a');
  const b = queue.enqueue('https://b/', {}, () => 'shape-b');
  await queue.idle();

  assert.equal(queue.get(a)!.result, 'shape-a');
  assert.equal(queue.get(b)!.result, 'shape-b');
});

// ── concurrency ────────────────────────────────────────────────────────

test('no more than maxConcurrent extractions run at once', async () => {
  const { run, started, finish } = deferredRunner();
  const queue = new JobQueue<Extract>({ run, maxConcurrent: 2 });
  queue.enqueue('https://a/', {}, identity);
  queue.enqueue('https://b/', {}, identity);
  const third = queue.enqueue('https://c/', {}, identity);

  assert.deepEqual(started, ['https://a/', 'https://b/']);
  assert.equal(queue.get(third)!.status, 'queued');

  finish('https://a/', ok({ url: 'https://a/' }));
  await new Promise((r) => setImmediate(r));
  assert.ok(started.includes('https://c/'), 'the queued job starts as soon as a slot frees');

  finish('https://b/', ok({ url: 'https://b/' }));
  finish('https://c/', ok({ url: 'https://c/' }));
  await queue.idle();
});

// ── cancellation ───────────────────────────────────────────────────────

test('a queued job can be cancelled and never starts', async () => {
  const { run, started, finish } = deferredRunner();
  const queue = new JobQueue<Extract>({ run, maxConcurrent: 1 });
  queue.enqueue('https://a/', {}, identity);
  const queued = queue.enqueue('https://b/', {}, identity);

  assert.equal(queue.cancel(queued), true);
  assert.equal(queue.get(queued)!.status, 'cancelled');

  finish('https://a/', ok({ url: 'https://a/' }));
  await queue.idle();
  assert.deepEqual(started, ['https://a/'], 'a cancelled job is never handed to the runner');
});

test('a running job cannot be cancelled, since the browser is already open', async () => {
  const { run, finish } = deferredRunner();
  const queue = new JobQueue<Extract>({ run });
  const id = queue.enqueue('https://a/', {}, identity);

  assert.equal(queue.cancel(id), false);
  assert.equal(queue.get(id)!.status, 'running');

  finish('https://a/', ok({ url: 'https://a/' }));
  await queue.idle();
});

test('cancelling an unknown id reports false', () => {
  const queue = new JobQueue<Extract>({ run: async () => ok({ url: 'https://x/' }) });
  assert.equal(queue.cancel('nope'), false);
});

// ── listing and cleanup ────────────────────────────────────────────────

test('list reports every job without leaking the payload', async () => {
  const queue = new JobQueue<Extract>({ run: async () => ok({ url: 'https://x/', colors: { big: true } }) });
  queue.enqueue('https://x/', {}, identity);
  await queue.idle();

  const [row] = queue.list();
  assert.deepEqual(Object.keys(row).sort(), ['completedAt', 'createdAt', 'job_id', 'status', 'url']);
  assert.equal(row.status, 'completed');
});

test('cleanup drops finished jobs past the TTL and keeps fresh ones', async () => {
  let clock = 1_000_000;
  const queue = new JobQueue<Extract>({ run: async () => ok({ url: 'https://x/' }), now: () => clock });
  const old = queue.enqueue('https://old/', {}, identity);
  await queue.idle();

  clock += DEFAULT_JOB_TTL_MS + 1;
  const fresh = queue.enqueue('https://fresh/', {}, identity);
  await queue.idle();

  queue.cleanup();
  assert.equal(queue.get(old), null);
  assert.ok(queue.get(fresh));
});

test('cleanup never drops a job that is still running', async () => {
  let clock = 1_000_000;
  const { run, finish } = deferredRunner();
  const queue = new JobQueue<Extract>({ run, now: () => clock });
  const id = queue.enqueue('https://a/', {}, identity);

  clock += DEFAULT_JOB_TTL_MS * 10;
  queue.cleanup();
  assert.equal(queue.get(id)!.status, 'running');

  finish('https://a/', ok({ url: 'https://a/' }));
  await queue.idle();
});

// ── resolveExtraction ──────────────────────────────────────────────────

const queueWith = (job: unknown) => ({ get: () => job } as never);

test('an inline extraction is used as given', () => {
  const inline = { url: 'https://x/' };
  assert.deepEqual(resolveExtraction(inline, undefined, 'result', queueWith(null)), { ok: true, value: inline });
});

test('an inline extraction wins over a job_id, so an explicit argument is never ignored', () => {
  const inline = { url: 'https://inline/' };
  const resolved = resolveExtraction(inline, 'job_1', 'result', queueWith({ status: 'completed', full: { url: 'https://job/' } }));
  assert.deepEqual(resolved.value, inline);
});

test('an empty object is not an extraction', () => {
  const resolved = resolveExtraction({}, undefined, 'result', queueWith(null));
  assert.equal(resolved.ok, false);
  assert.match(resolved.error!, /Pass either result or job_id/);
});

test('a completed job resolves to the whole extraction, not the sliced result', () => {
  const full = { url: 'https://x/', colors: {} };
  const resolved = resolveExtraction(undefined, 'job_1', 'result', queueWith({ status: 'completed', full, result: { colors: {} } }));
  assert.deepEqual(resolved.value, full);
});

test('an unknown job_id names the id it could not find', () => {
  const resolved = resolveExtraction(undefined, 'job_missing', 'result', queueWith(null));
  assert.equal(resolved.ok, false);
  assert.match(resolved.error!, /No job found with id: job_missing/);
});

test('an unfinished job reports its status instead of resolving to undefined', () => {
  for (const status of ['queued', 'running', 'failed', 'cancelled']) {
    const resolved = resolveExtraction(undefined, 'job_1', 'result', queueWith({ status }));
    assert.equal(resolved.ok, false, status);
    assert.match(resolved.error!, new RegExp(`is ${status}, not completed`));
  }
});

test('the label names the argument the caller left out', () => {
  assert.match(resolveExtraction(undefined, undefined, 'baseline', queueWith(null)).error!, /Pass either baseline or job_id/);
});
