import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * The CLI and the MCP server are two front doors onto one engine, and they
 * drift apart silently: `--shadcn` shipped in 0.34.0 and no agent could reach
 * it for two releases, because nothing compared the two lists.
 *
 * Every CLI flag is either answered over MCP or listed here as deliberately
 * CLI-only, with the reason. A new flag fails this test until someone decides
 * which it is.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(HERE, '..', 'index.js');
const SERVER = resolve(HERE, '..', 'mcp-server.js');
const run = promisify(execFile);

/** A CLI flag answered by an MCP tool of its own. */
const TOOL_FOR_FLAG: Record<string, string> = {
  '--dtcg': 'export_dtcg',
  '--design-md': 'generate_design_md',
  '--tailwind': 'export_tailwind',
  '--shadcn': 'export_shadcn',
  '--html': 'render_report',
  '--compare': 'compute_drift',
};

/** A CLI flag answered by a parameter on the extraction tools. */
const PARAM_FOR_FLAG: Record<string, string> = {
  '--dark-mode': 'darkMode',
  '--mobile': 'mobile',
  '--slow': 'slow',
  '--crawl': 'pages',
  '--sitemap': 'sitemap',
  '--cookie': 'cookie',
  '--header': 'header',
  '--user-agent': 'userAgent',
  '--no-sandbox': 'noSandbox',
};

/**
 * Deliberately CLI-only. The reason is the point: an entry here is a decision,
 * and an entry nobody can justify is a gap wearing a disguise.
 */
const CLI_ONLY: Record<string, string> = {
  '--json-only': 'Output shaping for a terminal. MCP returns structured content already.',
  '--save-output': 'Writes to the caller\'s disk. An agent writes the file itself.',
  '--raw-colors': 'Pre-filter debugging aid, not a product surface.',
  '--color-format': 'Changes what the terminal prints. JSON carries every notation regardless.',
  '--screenshot': 'Binary image to a path. Revisit if agents start asking for the viewport.',
  '--brand-guide': 'A PDF. Base64 through the model is the wrong shape for a 2MB document.',
  '--approve': 'Rewrites a baseline file on disk, which belongs to the CI job, not the agent.',
  '--browser': 'Engine selection is a local install concern.',
  '--stealth': 'Opt-in anti-detection. Deliberately not offered to an autonomous caller.',
  '--key': 'Account sync. An agent is not the account holder.',
  '--locale': 'Fingerprint detail with no agent-facing use yet.',
  '--timezone': 'Fingerprint detail with no agent-facing use yet.',
  '--accept-language': 'Fingerprint detail with no agent-facing use yet.',
  '--screen-size': 'Fingerprint detail with no agent-facing use yet.',
  '--version': 'Protocol handshake carries the server version.',
  '--help': 'Protocol handshake carries the tool list.',
  '--ai': 'Experimental ML primary prediction; not a promised surface.',
  '--wcag': 'A parameter on get_design_tokens, and get_findings reports the failures.',
};

interface ToolDefinition {
  name: string;
  inputSchema: { properties?: Record<string, unknown> };
}

let client: Client;
let tools: ToolDefinition[];
let cliFlags: string[];

before(async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER] });
  client = new Client({ name: 'surface-parity', version: '1' });
  await client.connect(transport);
  tools = (await client.listTools()).tools as ToolDefinition[];

  const { stdout } = await run(process.execPath, [CLI, '--help']);
  cliFlags = [...new Set(stdout.match(/--[a-z][a-z-]+/g) ?? [])];
});

after(async () => { await client?.close().catch(() => {}); });

test('the CLI help lists flags at all', () => {
  assert.ok(cliFlags.length > 15, `parsed only ${cliFlags.length} flags, so the check below proves nothing`);
});

test('every CLI flag is answered over MCP or declared CLI-only', () => {
  const toolNames = new Set(tools.map((t) => t.name));
  const extractionParams = new Set(
    Object.keys(tools.find((t) => t.name === 'get_design_tokens')?.inputSchema.properties ?? {}),
  );

  const unexplained: string[] = [];
  for (const flag of cliFlags) {
    if (flag in CLI_ONLY) continue;
    const tool = TOOL_FOR_FLAG[flag];
    if (tool) {
      assert.ok(toolNames.has(tool), `${flag} claims ${tool} over MCP, and that tool is gone`);
      continue;
    }
    const param = PARAM_FOR_FLAG[flag];
    if (param) {
      assert.ok(extractionParams.has(param), `${flag} claims the ${param} parameter, which the tools no longer take`);
      continue;
    }
    unexplained.push(flag);
  }

  assert.deepEqual(unexplained, [],
    `these flags reach a CLI user and no agent: add an MCP tool or parameter, or say in CLI_ONLY why not`);
});

test('every extraction tool takes the whole navigation surface, not just one of them', () => {
  const shared = ['slow', 'mobile', 'darkMode', 'cookie', 'header', 'userAgent', 'noSandbox', 'pages', 'paths', 'sitemap'];
  const extraction = tools.filter((t) => Object.keys(t.inputSchema.properties ?? {}).includes('url'));
  assert.ok(extraction.length >= 7, 'expected the seven extraction tools');
  for (const tool of extraction) {
    const props = Object.keys(tool.inputSchema.properties ?? {});
    for (const param of shared) {
      assert.ok(props.includes(param), `${tool.name} cannot ${param}: the same page is not extractable through every door`);
    }
  }
});
