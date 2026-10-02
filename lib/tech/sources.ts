/**
 * Facts read from the files a page loaded, not from the traces they leave in
 * the DOM: licence banners, and version constants that survive minification.
 */
export interface SourceFacts {
  banners: string[];
  code: Record<string, string>;
}

export interface CodePattern {
  key: string;
  pattern: RegExp;
}

interface SourceResponse {
  url(): string;
  status(): number;
  headers(): Record<string, string>;
  request(): { resourceType(): string };
  body(): Promise<Buffer>;
}

interface SourcePage {
  on(event: 'response', listener: (response: SourceResponse) => void): unknown;
  addInitScript(script: string): Promise<unknown>;
  content(): Promise<string>;
}

const MAX_FILE_BYTES = 4_000_000;
const MAX_TOTAL_BYTES = 40_000_000;
const MAX_BANNERS = 150;
const MAX_COMMENT = 20000;
const NAMED_VERSION = /[A-Za-z].{0,60}?\bv?\d+\.\d+(\.\d+)?/;

export const emptyFacts = (): SourceFacts => ({ banners: [], code: {} });

/** A banner is one line of a licence comment that names something and its version; bundlers stack many in one comment. */
export function scanSource(text: string, patterns: CodePattern[], facts: SourceFacts): void {
  const seen = new Map(facts.banners.map((line) => [line.match(NAMED_VERSION)?.[0] ?? line, line]));
  for (let start = text.indexOf('/*'); start !== -1 && seen.size < MAX_BANNERS; ) {
    const end = text.indexOf('*/', start + 2);
    if (end === -1) break;
    const comment = end - start <= MAX_COMMENT ? text.slice(start, end + 2) : '';
    start = text.indexOf('/*', end + 2);
    for (const raw of comment.split('\n')) {
      if (seen.size >= MAX_BANNERS) break;
      const line = raw.replace(/^\/\*+!?|\*+\/$/g, '').replace(/^[\s*#!@(]+/, '').replace(/\*+\)\s*$/, '').replace(/[\s*]+$/, '').replace(/^license\s+/i, '').replace(/^@/, '').replace(/\s+/g, ' ').slice(0, 110);
      const named = line.match(NAMED_VERSION)?.[0];
      if (named && /^[A-Za-z][\w .,@/:✨-]*$/.test(named) && !seen.has(named)) seen.set(named, line);
    }
  }
  facts.banners = [...seen.values()];
  for (const { key, pattern } of patterns) {
    if (facts.code[key]) continue;
    const version = text.match(pattern)?.[1];
    if (version) facts.code[key] = version.slice(0, 24);
  }
}

/**
 * React hands its version to whatever sits on the devtools hook, in production
 * builds too. An inert hook is the only place a bundled React states it.
 */
export const RENDERER_HOOK_SCRIPT = `(() => {
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) return;
  const renderers = new Map();
  const noop = () => {};
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers, supportsFiber: true, supportsFlight: true, hasUnsupportedRendererAttached: false,
    inject(renderer) { const id = renderers.size + 1; renderers.set(id, renderer); return id; },
    onCommitFiberRoot: noop, onCommitFiberUnmount: noop, onPostCommitFiberRoot: noop, onScheduleFiberRoot: noop,
    setStrictMode: noop, checkDCE: noop, on: noop, off: noop, emit: noop, sub: () => noop,
  };
})();`;

interface Watch {
  facts: SourceFacts;
  pending: Promise<void>[];
  bytes: number;
}

const watches = new WeakMap<object, Watch>();

export async function watchSources(page: SourcePage, patterns: CodePattern[]): Promise<void> {
  const watch: Watch = { facts: emptyFacts(), pending: [], bytes: 0 };
  watches.set(page, watch);
  await page.addInitScript(RENDERER_HOOK_SCRIPT);
  page.on('response', (response) => {
    const type = response.request().resourceType();
    if ((type !== 'script' && type !== 'stylesheet') || response.status() !== 200) return;
    if (Number(response.headers()['content-length'] ?? 0) > MAX_FILE_BYTES || watch.bytes > MAX_TOTAL_BYTES) return;
    watch.pending.push(response.body().then((body) => {
      if (body.length > MAX_FILE_BYTES) return;
      watch.bytes += body.length;
      scanSource(body.toString('utf8'), patterns, watch.facts);
    }).catch(() => {}));
  });
}

/** Facts from every file seen so far plus the document's inline scripts and styles. Empty when the page was never watched. */
export async function sourceFacts(page: SourcePage, patterns: CodePattern[]): Promise<SourceFacts> {
  const watch = watches.get(page);
  if (!watch) return emptyFacts();
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([Promise.all(watch.pending), new Promise((resolve) => { timer = setTimeout(resolve, 5000); })]);
  clearTimeout(timer);
  try { scanSource(await page.content(), patterns, watch.facts); } catch {}
  return { banners: [...watch.facts.banners], code: { ...watch.facts.code } };
}
