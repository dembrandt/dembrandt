import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * The server file itself: tool declarations, the zod schemas they compile to,
 * the console silencing and the shutdown path. None of that is reachable from a
 * unit test, and a break in it reaches every MCP client at once.
 *
 * Speaks real JSON-RPC over stdio. No browser: every case here either fails
 * before launch or never reaches an extraction.
 */

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'mcp-server.js');

/** A JSON-RPC response. The payloads are the server's own shapes, so they stay unknown here. */
interface Rpc { id?: number; result?: Record<string, unknown>; error?: unknown }

interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties?: Record<string, unknown>; required?: string[] };
}

class Client {
  #proc: ChildProcessWithoutNullStreams;
  #buf = '';
  #waiters = new Map<number, (m: Rpc) => void>();
  #id = 0;
  /** Anything the server writes to stderr; must stay empty in normal operation. */
  stderr = '';

  constructor() {
    this.#proc = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.#proc.stdout.setEncoding('utf8');
    this.#proc.stdout.on('data', (chunk: string) => {
      this.#buf += chunk;
      let i: number;
      while ((i = this.#buf.indexOf('\n')) >= 0) {
        const line = this.#buf.slice(0, i);
        this.#buf = this.#buf.slice(i + 1);
        if (!line.trim()) continue;
        // A non-JSON line means something wrote to stdout and corrupted the
        // stream; surface it as a failure rather than swallowing it.
        const msg = JSON.parse(line) as Rpc;
        const waiter = msg.id != null ? this.#waiters.get(msg.id) : undefined;
        if (waiter) { this.#waiters.delete(msg.id as number); waiter(msg); }
      }
    });
    this.#proc.stderr.setEncoding('utf8');
    this.#proc.stderr.on('data', (chunk: string) => { this.stderr += chunk; });
  }

  send(method: string, params?: unknown): Promise<Rpc> {
    const id = ++this.#id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`timed out waiting for ${method}`)), 15000);
      this.#waiters.set(id, (m) => { clearTimeout(timer); res(m); });
      this.#proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  notify(method: string): void {
    this.#proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
  }

  async call(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const res = await this.send('tools/call', { name, arguments: args });
    return (res.result ?? res.error) as ToolCallResult;
  }

  /** Close stdin and resolve with the exit code. */
  end(): Promise<number | null> {
    return new Promise((res) => {
      this.#proc.on('exit', (code) => res(code));
      this.#proc.stdin.end();
    });
  }

  kill(): void { this.#proc.kill(); }
}

let client: Client;
let tools: ToolDefinition[];

before(async () => {
  client = new Client();
  const init = await client.send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'protocol-smoke', version: '1' },
  });
  assert.equal(init.error, undefined, 'initialize must not error');
  client.notify('notifications/initialized');
  const listed = await client.send('tools/list');
  assert.equal(listed.error, undefined, `tools/list errored: ${JSON.stringify(listed.error)}`);
  tools = (listed.result as { tools: ToolDefinition[] }).tools;
});

after(() => client?.kill());

test('the server announces itself and its version', async () => {
  const c = new Client();
  const init = await c.send('initialize', {
    protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' },
  });
  const info = (init.result as { serverInfo: { name: string; version: string } }).serverInfo;
  assert.equal(info.name, 'dembrandt');
  assert.match(info.version, /^\d+\.\d+\.\d+/);
  c.kill();
});

test('every tool compiles to a valid schema', () => {
  // zod 4 rejects some zod 3 spellings at schema-build time, and the failure
  // surfaces here rather than at import: a bad schema takes down tools/list for
  // every tool at once, so one broken parameter breaks the whole server.
  assert.equal(tools.length, 15, `the tool set changed: ${tools.map((t) => t.name).join(", ")}`);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} has no object schema`);
    assert.ok(tool.description.length > 40, `${tool.name} needs a usable description`);
  }
});

test('extraction tools expose the crawl and auth surface', () => {
  const extraction = ['get_design_tokens', 'get_color_palette', 'get_typography',
    'get_component_styles', 'get_surfaces', 'get_spacing', 'get_brand_identity'];
  for (const name of extraction) {
    const tool = tools.find((t) => t.name === name);
    assert.ok(tool, `${name} is missing`);
    const props = Object.keys(tool.inputSchema.properties ?? {});
    for (const param of ['url', 'pages', 'paths', 'sitemap', 'header', 'userAgent', 'noSandbox']) {
      assert.ok(props.includes(param), `${name} is missing ${param}`);
    }
  }
});

test('pure tools accept a job_id in place of an inline extraction', () => {
  const pure = ['get_findings', 'export_dtcg', 'generate_design_md', 'render_report'];
  for (const name of pure) {
    const tool = tools.find((t) => t.name === name);
    assert.ok(tool, `${name} is missing`);
    const schema = tool.inputSchema;
    assert.ok(Object.keys(schema.properties ?? {}).includes('job_id'), `${name} takes no job_id`);
    // Neither may be required, or the other form becomes unusable.
    assert.ok(!(schema.required ?? []).includes('result'), `${name} still requires result`);
    assert.ok(!(schema.required ?? []).includes('job_id'), `${name} requires job_id`);
  }
  const drift = tools.find((t) => t.name === 'compute_drift');
  const driftProps = Object.keys(drift?.inputSchema.properties ?? {});
  assert.ok(driftProps.includes('baselineJobId') && driftProps.includes('candidateJobId'));
});

test('an unknown job_id is a tool error, not a protocol error', async () => {
  const res = await client.call('get_findings', { job_id: 'job_nope' });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /No job found with id: job_nope/);
});

test('omitting both result and job_id names what is missing', async () => {
  const res = await client.call('export_dtcg', {});
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /Pass either result or job_id/);
});

test('the pure tools run without a browser', async () => {
  const extraction = {
    url: 'https://example.com/',
    extractedAt: '2026-01-01T00:00:00.000Z',
    meta: { schemaVersion: '1.8.0', dembrandtVersion: '0.29.0' },
    colors: { palette: [{ normalized: '#133174', count: 40, confidence: 'high' }], semantic: { primary: '#133174' }, cssVariables: {} },
    typography: { styles: [], sources: {} },
    spacing: { commonValues: [] },
    borderRadius: { values: [] },
  };
  const drift = await client.call('compute_drift', { baseline: extraction, candidate: extraction });
  assert.notEqual(drift.isError, true, `compute_drift errored: ${JSON.stringify(drift)}`);
  assert.equal(JSON.parse(drift.content[0].text).score, 0, 'an extraction cannot drift from itself');

  const md = await client.call('generate_design_md', { result: extraction });
  assert.notEqual(md.isError, true);
  assert.match(md.content[0].text, /^#/m);
});

test('job listing works before any job exists', async () => {
  const res = await client.call('list_jobs', {});
  assert.deepEqual(JSON.parse(res.content[0].text), { jobs: [] });
});

test('nothing reaches stderr during normal operation', () => {
  // stdout is the JSON-RPC stream and stderr is what a client surfaces as a
  // server fault, so an extractor writing to either is a defect.
  assert.equal(client.stderr, '', `server wrote to stderr: ${client.stderr}`);
});

test('the process exits when its transport closes', async () => {
  const c = new Client();
  await c.send('initialize', {
    protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' },
  });
  c.notify('notifications/initialized');
  const code = await c.end();
  assert.equal(code, 0, 'closing stdin must end the process, not leave it running');
});
