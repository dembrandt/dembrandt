import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * The server file itself: tool declarations, the zod schemas they compile to,
 * and the shutdown path. None of that is reachable from a unit test, and a
 * break in it reaches every MCP client at once.
 *
 * Driven with the SDK's own client over stdio, which is the code path a real
 * editor takes. No browser: every case here either fails before launch or never
 * reaches an extraction.
 */

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'mcp-server.js');

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties?: Record<string, unknown>; required?: string[] };
}

interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

async function connect() {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER] });
  const client = new Client({ name: 'protocol-smoke', version: '1' });
  await client.connect(transport);
  return { client, transport };
}

let client: Client;
let tools: ToolDefinition[];

before(async () => {
  ({ client } = await connect());
  tools = (await client.listTools()).tools as ToolDefinition[];
});

after(async () => { await client?.close().catch(() => {}); });

const call = async (name: string, args: Record<string, unknown>) =>
  (await client.callTool({ name, arguments: args })) as unknown as ToolCallResult;

test('the server announces itself and its version', () => {
  const info = client.getServerVersion();
  assert.equal(info?.name, 'dembrandt');
  assert.match(String(info?.version), /^\d+\.\d+\.\d+/);
});

test('every tool compiles to a valid schema', () => {
  // zod 4 rejects some zod 3 spellings at schema-build time, and the failure
  // takes down tools/list for every tool at once: one bad parameter breaks the
  // whole server, which is how #158 shipped a compute_drift nobody could call.
  assert.equal(tools.length, 15, `the tool set changed: ${tools.map(t => t.name).join(', ')}`);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} has no object schema`);
    assert.ok(tool.description.length > 40, `${tool.name} needs a usable description`);
  }
});

test('extraction tools expose the crawl and auth surface', () => {
  const extraction = ['get_design_tokens', 'get_color_palette', 'get_typography',
    'get_component_styles', 'get_surfaces', 'get_spacing', 'get_brand_identity'];
  for (const name of extraction) {
    const tool = tools.find(t => t.name === name);
    assert.ok(tool, `${name} is missing`);
    const props = Object.keys(tool.inputSchema.properties ?? {});
    for (const param of ['url', 'pages', 'paths', 'sitemap', 'header', 'userAgent', 'noSandbox']) {
      assert.ok(props.includes(param), `${name} is missing ${param}`);
    }
  }
});

test('pure tools accept a job_id in place of an inline extraction', () => {
  for (const name of ['get_findings', 'export_dtcg', 'generate_design_md', 'render_report']) {
    const tool = tools.find(t => t.name === name);
    assert.ok(tool, `${name} is missing`);
    const schema = tool.inputSchema;
    assert.ok(Object.keys(schema.properties ?? {}).includes('job_id'), `${name} takes no job_id`);
    // Requiring either one makes the other form unusable.
    assert.ok(!(schema.required ?? []).includes('result'), `${name} still requires result`);
    assert.ok(!(schema.required ?? []).includes('job_id'), `${name} requires job_id`);
  }
  const drift = tools.find(t => t.name === 'compute_drift');
  const driftProps = Object.keys(drift?.inputSchema.properties ?? {});
  assert.ok(driftProps.includes('baselineJobId') && driftProps.includes('candidateJobId'));
});

test('an unknown job_id is a tool error, not a protocol error', async () => {
  const res = await call('get_findings', { job_id: 'job_nope' });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /No job found with id: job_nope/);
});

test('omitting both result and job_id names what is missing', async () => {
  const res = await call('export_dtcg', {});
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
  const drift = await call('compute_drift', { baseline: extraction, candidate: extraction });
  assert.notEqual(drift.isError, true, `compute_drift errored: ${JSON.stringify(drift)}`);
  assert.equal(JSON.parse(drift.content[0].text).score, 0, 'an extraction cannot drift from itself');

  const md = await call('generate_design_md', { result: extraction });
  assert.notEqual(md.isError, true);
  assert.match(md.content[0].text, /^#/m);
});

test('job listing works before any job exists', async () => {
  const res = await call('list_jobs', {});
  assert.deepEqual(JSON.parse(res.content[0].text), { jobs: [] });
});

test('the process exits when its transport closes', async () => {
  const fresh = await connect();
  const proc = (fresh.transport as unknown as { _process?: { exitCode: number | null } })._process;
  await fresh.client.close();
  // Give the child a moment to notice stdin closed.
  await new Promise(r => setTimeout(r, 500));
  assert.notEqual(proc?.exitCode, null, 'closing the transport must end the process, not leave it running');
});
