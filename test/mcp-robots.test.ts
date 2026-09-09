import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * The MCP server has to match the robots.txt group that governs the User-Agent
 * it sends, exactly as the CLI does. Reading the `*` group while announcing
 * ourselves means a site can refuse us by name with no effect, which is a
 * refusal read as permission.
 */

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'mcp-server.js');

const ROBOTS = 'User-agent: *\nAllow: /\n\nUser-agent: Dembrandt\nDisallow: /\n';

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>MCP fixture</title><style>
  :root { --brand-ink: #1d4ed8; }
  body { margin: 0; font-family: Georgia, serif; font-size: 16px; line-height: 1.5;
         color: #202124; background: #ffffff; }
  h1 { font-size: 32px; font-weight: 700; letter-spacing: -0.5px; }
  .cta { background: var(--brand-ink); color: #ffffff; border-radius: 8px;
         padding: 16px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); border: 0; }
  .card { border-radius: 8px; padding: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
</style></head>
<body>
  <header><h1>MCP fixture</h1></header>
  <main>
    <p>Body copy so the body font and size are measured on real text.</p>
    <div class="card"><p>Card copy.</p><button class="cta">Primary action</button></div>
  </main>
</body></html>`;

const NAMED_UA = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/136.0.0.0 Dembrandt/test (+https://dembrandt.com/bot)';
const PLAIN_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

let server: Server;
let origin: string;
let client: Client;

async function getTokens(userAgent: string): Promise<string> {
  const result = (await client.callTool({
    name: 'get_design_tokens',
    arguments: { url: origin, sync: true, userAgent },
  })) as { content: Array<{ type: string; text: string }> };
  return result.content.map((c) => c.text).join('\n');
}

before(async () => {
  server = createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(ROBOTS);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'server did not bind a port');
  origin = `http://127.0.0.1:${address.port}`;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, DEMBRANDT_ENFORCE_ROBOTS: '1' } as Record<string, string>,
  });
  client = new Client({ name: 'robots-smoke', version: '1' });
  await client.connect(transport);
});

after(async () => {
  await client?.close();
  server?.close();
});

test('a run that names itself is refused by the group naming it', { timeout: 120_000 }, async () => {
  const text = await getTokens(NAMED_UA);
  assert.match(text, /Skipping/);
  assert.match(text, /DEMBRANDT_ENFORCE_ROBOTS=1/);
});

test('the same site under an unnamed run reads the * group and proceeds', { timeout: 180_000 }, async () => {
  const text = await getTokens(PLAIN_UA);
  assert.doesNotMatch(text, /Skipping/);
  const result = JSON.parse(text);
  assert.ok(result.typography.styles.length > 0, 'nothing was extracted');
});
