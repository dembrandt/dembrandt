# Dembrandt.

[![npm version](https://img.shields.io/npm/v/dembrandt.svg)](https://www.npmjs.com/package/dembrandt)
[![npm downloads](https://img.shields.io/npm/dm/dembrandt.svg)](https://www.npmjs.com/package/dembrandt)
[![license](https://img.shields.io/npm/l/dembrandt.svg)](https://github.com/dembrandt/dembrandt/blob/main/LICENSE)

Extract a website's design system into design tokens in a few seconds: logo, colors, typography, borders, and more. One command.

![Dembrandt: Any website to design tokens](https://raw.githubusercontent.com/dembrandt/dembrandt/main/docs/images/banner.png)

## Install

Install globally: `npm install -g dembrandt`

```bash
dembrandt example.com
```

Or use npx without installing: `npx dembrandt example.com`

Requires Node.js 18+

## AI Agent Integration (MCP)

Use Dembrandt as a tool in Claude Code, Cursor, Windsurf, or any MCP-compatible client. Ask your agent to "extract the color palette from example.com" and it calls Dembrandt automatically.

```bash
claude mcp add --transport stdio dembrandt -- npx -y dembrandt-mcp
```

Or add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "dembrandt": {
      "command": "npx",
      "args": ["-y", "dembrandt-mcp"]
    }
  }
}
```

7 tools available: `get_design_tokens`, `get_color_palette`, `get_typography`, `get_component_styles`, `get_surfaces`, `get_spacing`, `get_brand_identity`.

## What to expect from extraction?

- Colors (semantic, palette, CSS variables)
- Typography (fonts, sizes, weights, sources)
- Spacing (margin/padding scales)
- Borders (radius, widths, styles, colors)
- Shadows
- Components (buttons, badges, inputs, links)
- Breakpoints
- Icons & frameworks

## Usage

```bash
dembrandt <url>                        # Basic extraction (terminal display only)
dembrandt example.com --json-only      # Output raw JSON to terminal (no formatted display, no file save)
dembrandt example.com --save-output    # Save JSON to output/example.com/YYYY-MM-DDTHH-MM-SS.json
dembrandt example.com --dtcg           # Export in W3C Design Tokens (DTCG) format (auto-saves as .tokens.json)
dembrandt example.com --dark-mode      # Extract colors from dark mode variant
dembrandt example.com --mobile         # Use mobile viewport (390x844) for responsive analysis
dembrandt example.com --slow           # 3x longer timeouts (24s hydration) for JavaScript-heavy sites
dembrandt example.com --brand-guide    # Generate a brand guide PDF
dembrandt example.com --design-md      # Generate a DESIGN.md file for AI agents
dembrandt example.com --pages 5        # Analyze 5 pages (homepage + 4 discovered pages), merges results
dembrandt example.com --sitemap        # Discover pages from sitemap.xml instead of DOM links
dembrandt example.com --pages 10 --sitemap # Combine: up to 10 pages discovered via sitemap
dembrandt example.com --no-sandbox     # Disable Chromium sandbox (required for Docker/CI)
dembrandt example.com --browser=firefox # Use Firefox instead of Chromium (better for Cloudflare bypass)
dembrandt example.com --wcag           # WCAG 2.1 contrast analysis — real DOM pairs, AA/AAA grades
```

Default: formatted terminal display only. Use `--save-output` to persist results as JSON files. Browser automatically retries in visible mode if headless extraction fails.

### Multi-Page Extraction

Analyze multiple pages to get a more complete picture of a site's design system. Results are merged into a single unified output with cross-page confidence boosting: tokens appearing on multiple pages get higher confidence scores.

```bash
# Analyze homepage + 4 auto-discovered pages (default: 5 total)
dembrandt example.com --pages 5

# Use sitemap.xml for page discovery instead of DOM link scraping
dembrandt example.com --sitemap

# Combine both: up to 10 pages from sitemap
dembrandt example.com --pages 10 --sitemap
```

**Page discovery** works two ways:
- **DOM links** (default): Reads navigation, header, and footer links from the homepage, prioritizing key pages like /pricing, /about, /features
- **Sitemap** (`--sitemap`): Parses sitemap.xml (checks robots.txt first), follows sitemapindex references, and scores URLs by importance

Pages are fetched sequentially with polite delays. Failed pages are skipped without aborting the run.

### Browser Selection

By default, dembrandt uses Chromium. If you encounter bot detection or timeouts (especially on sites behind Cloudflare), try Firefox which is often more successful at bypassing these protections:

```bash
# Use Firefox instead of Chromium
dembrandt example.com --browser=firefox

# Combine with other flags
dembrandt example.com --browser=firefox --save-output --dtcg
```

**When to use Firefox:**
- Sites behind Cloudflare or other bot detection systems
- Timeout issues on heavily protected sites
- WSL environments where headless Chromium may struggle

**Installation:**
Firefox browser is installed automatically with `npm install`. If you need to install manually:

```bash
npx playwright install firefox
```

### W3C Design Tokens (DTCG) Format

Use `--dtcg` to export in the standardized [W3C Design Tokens Community Group](https://www.designtokens.org/) format:

```bash
dembrandt example.com --dtcg
# Saves to: output/example.com/TIMESTAMP.tokens.json
```

The DTCG format is an industry-standard JSON schema that can be consumed by design tools and token transformation libraries like [Style Dictionary](https://styledictionary.com).

### DESIGN.md

Use `--design-md` to generate a [DESIGN.md](https://stitch.withgoogle.com/docs/design-md) file, a plain-text design system document readable by AI agents.

```bash
dembrandt example.com --design-md
# Saves to: output/example.com/DESIGN.md
```

### WCAG Contrast Analysis

Use `--wcag` to check accessibility contrast ratios across the page. Unlike palette-based checkers, dembrandt walks the actual DOM and finds what color is rendered on top of what background — per element.

```bash
dembrandt stripe.com --wcag
```

Returns every text/background pair with contrast ratio and WCAG 2.1 grade (AA, AA-Large, AAA, or fail), sorted by how often each pair appears. Results are shown in terminal and included in JSON output as `wcag`.

### Brand Guide PDF

Use `--brand-guide` to generate a printable PDF summarizing the extracted design system: colors, typography, components, and logo on a single document.

```bash
dembrandt example.com --brand-guide
# Saves to: output/example.com/TIMESTAMP.brand-guide.pdf
```

## Local UI

Browse your extractions in a visual interface.

### Setup

```bash
cd local-ui
npm install
```

### Running

```bash
npm start
```

Opens http://localhost:5173 with API on port 3002.

### Features

- Visual grid of all extractions
- Color palettes with click-to-copy
- Typography specimens
- Spacing, shadows, border radius visualization
- Button and link component previews
- Dark/light theme toggle
- Section nav links on extraction pages, jump directly to Colors, Typography, Shadows, etc. via a sticky sidebar

Extractions are performed via CLI (`dembrandt <url> --save-output`) and automatically appear in the UI.

## Recipes

**Quick brand scan**
```bash
dembrandt stripe.com
```

**Compare two sites**
```bash
dembrandt stripe.com --save-output
dembrandt braintree.com --save-output
# Compare output/stripe.com and output/braintree.com side by side
```

**Multi-page audit** — get a fuller picture across the whole site
```bash
dembrandt stripe.com --pages 10 --sitemap --save-output
```

**Spot-check a value** — verify a specific token fast
```bash
dembrandt stripe.com --json-only | grep -i "border-radius"
```

**Export for Tailwind** — get spacing and color values into your config
```bash
dembrandt stripe.com --dtcg --save-output
# Use the .tokens.json with Style Dictionary to generate tailwind.config.js
```

**Export for Tokens Studio / Figma**
```bash
dembrandt stripe.com --dtcg --save-output
# Import the .tokens.json directly into Tokens Studio
```

**Generate DESIGN.md for your AI agent**
```bash
dembrandt stripe.com --design-md
# Point your agent at the output DESIGN.md
```

**Accessibility audit** — check contrast on any live URL
```bash
dembrandt stripe.com --wcag
```

**Regression baseline** — snapshot now, catch drift later
```bash
dembrandt myapp.com --save-output --dtcg
# Store output as baseline, re-run after deploys and diff
```

**CI / headless environments**
```bash
dembrandt myapp.com --no-sandbox --save-output
```

## Use Cases

- Design system documentation
- Multi-site design consolidation
- Internal design audits on your own properties
- Learning how design tokens map to real CSS

## How It Works

Uses Playwright to render the page, reads computed styles from the DOM, analyzes color usage and confidence, groups similar typography, detects spacing patterns, and returns design tokens.

### Extraction Process

1. Browser Launch - Launches browser (Chromium by default, Firefox optional) with stealth configuration
2. Anti-Detection - Injects scripts to bypass bot detection
3. Navigation - Navigates to target URL with retry logic
4. Hydration - Waits for SPAs to fully load (8s initial + 4s stabilization)
5. Content Validation - Verifies page content is substantial (>500 chars)
6. Parallel Extraction - Runs all extractors concurrently for speed
7. Analysis - Analyzes computed styles, DOM structure, and CSS variables
8. Scoring - Assigns confidence scores based on context and usage

### Color Confidence

- High: Logo, primary interactive elements
- Medium: Secondary interactive elements, icons, navigation
- Low: Generic UI components (filtered from display)
- Only shows high and medium confidence colors in terminal. Full palette in JSON.

## Limitations

- Dark mode requires `--dark-mode` flag (not automatically detected)
- Hover/focus states extracted from CSS (not fully interactive)
- Canvas/WebGL-rendered sites cannot be analyzed (no DOM to read)
- JavaScript-heavy sites require hydration time (8s initial + 4s stabilization)
- Some dynamically-loaded content may be missed
- Default viewport is 1920x1080 (use `--mobile` for 390x844 mobile viewport)

## Intended Use

Dembrandt reads publicly available CSS and computed styles from website DOMs for documentation, learning, and analysis of design systems you own or have permission to analyze.

Only run Dembrandt against sites whose Terms of Service permit automated access, or against your own properties. Do not use extracted material to reproduce third-party brand identities, logos, or trademarks. Respect robots.txt, rate limits, and copyright.

Dembrandt does not host, redistribute, or claim rights to any third-party brand assets.

## Contributing

Bugs, weird sites, pull requests. All welcome.

Open an [Issue](https://github.com/dembrandt/dembrandt/issues) or PR.

@thevangelist

MIT. Do whatever you want with it.
