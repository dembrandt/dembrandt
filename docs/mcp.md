# MCP server

Dembrandt runs as a Model Context Protocol server, so an agent can call extraction and analysis as tools. It is listed in the [MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.dembrandt/dembrandt) as `io.github.dembrandt/dembrandt`.

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=dembrandt&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImRlbWJyYW5kdCIsIm1jcCJdfQ==)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=dembrandt&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22dembrandt%22%2C%22mcp%22%5D%7D)

## Install

Claude Code:

```bash
claude mcp add --transport stdio dembrandt -- npx -y dembrandt mcp
```

Claude Desktop, Cursor, Windsurf and any client that reads a JSON config:

```json
{
  "mcpServers": {
    "dembrandt": {
      "command": "npx",
      "args": ["-y", "dembrandt", "mcp"]
    }
  }
}
```

Claude Desktop: Settings, Developer, Edit Config, paste the block inside `mcpServers`, restart. Cursor and Windsurf: `.mcp.json` at the repo root. Claude Code can also take the skills repo as a plugin, which registers this server alongside 45 UX skills: `/plugin marketplace add dembrandt/dembrandt-skills`.

## Environment

| Variable | Effect |
|---|---|
| `DEMBRANDT_KEY` | API key from [dembrandt.com/app/api-keys](https://www.dembrandt.com/app/api-keys). Uploads each extraction as a snapshot and scores it against the previous one for that domain. |
| `BROWSER_CDP_ENDPOINT` | Connect to a running Chromium over CDP instead of launching one, e.g. `http://localhost:9222`. |

## Tools

Extraction tools: `get_design_tokens`, `get_color_palette`, `get_typography`, `get_component_styles`, `get_surfaces`, `get_spacing`, `get_brand_identity`. Each accepts `slow`, `mobile`, `darkMode`, `wcag`, `cookie`, `cookieFile`, `basicAuth`, `header`, `userAgent`, `noSandbox`, `pages`, `paths` and `sitemap`. Interactive `--login` stays CLI-only.

Extraction returns a `job_id`. Poll it with `get_job_status`, then hand the id to the pure tools instead of passing the extraction back as an argument: `compute_drift`, `get_findings`, `export_dtcg`, `generate_design_md`, `render_report`.

The server honours robots.txt the same way the CLI does; see [ci.md](ci.md) for `DEMBRANDT_ENFORCE_ROBOTS`.

Per-client walkthrough with screenshots: [dembrandt.com/mcp](https://www.dembrandt.com/mcp).
