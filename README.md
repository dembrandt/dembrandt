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

Pair with **[dembrandt-skills](https://github.com/dembrandt/dembrandt-skills)** to give your agent UX intelligence on top of extracted tokens — hierarchy, accessibility, interaction states, and a full 6-stage design pipeline orchestrator.

```bash
npx skills add dembrandt/dembrandt-skills
```

## Dembrandt App (Beta)

Load extractions, track token drift, and compare snapshots. **[dembrandt.com/app](https://www.dembrandt.com/app)**

* **Drift tracking.** Pin a snapshot as your baseline. Run another extraction later. Get a visual report of what changed.
* **Visual diff.** Color swatches, before/after values, delta scores per category.
* **Snapshot history.** GitHub-style calendar per domain.
* **Copy tokens.** Paste values straight into Copilot, Claude, or Cursor.
* **No login.** Your data stays in the browser. Drift is computed locally — nothing is sent to any server.

## Recipes

**[dembrandt.com/recipes](https://www.dembrandt.com/recipes)** — 38 ready-to-run workflows. Copy a command, paste a prompt, get a result. Covers competitor benchmarking, WCAG audits, CI/CD drift detection, Figma token push, and agentic design system builds. Filterable by role.

## What to expect from extraction?

- Colors (semantic, palette, CSS variables, gradients)
- Typography (fonts, sizes, weights, sources)
- Spacing (margin/padding scales)
- Borders (radius, widths, styles, colors)
- Shadows
- Motion (duration scale, easing curves, hover patterns per component type)
- Components (buttons, badges, inputs, links)
- Breakpoints
- Icons & frameworks

## Usage

```bash
dembrandt init example.com             # Save baseline (.dembrandt/ (config.json + snapshot.yaml + tokens.json))
dembrandt init example.com --crawl 5   # Multi-page baseline (homepage + 4 discovered pages)
dembrandt drift                        # Compare live site against baseline, exit 1 on drift
dembrandt drift --url https://staging  # Drift check against a different URL
dembrandt drift --json                 # Machine-readable drift report (stdout)
dembrandt drift --threshold 20         # Custom drift score threshold
dembrandt <url>                        # Basic extraction (terminal display only)
dembrandt example.com --json-only      # Output raw JSON to terminal (no formatted display, no file save)
dembrandt example.com --save-output    # Save JSON to output/example.com/YYYY-MM-DDTHH-MM-SS.json
dembrandt example.com --dtcg           # Export in W3C Design Tokens (DTCG) format (auto-saves as .tokens.json)
dembrandt example.com --dark-mode      # Extract colors from dark mode variant
dembrandt example.com --mobile         # Use mobile viewport (390x844) for responsive analysis
dembrandt example.com --slow           # 3x longer timeouts (24s hydration) for JavaScript-heavy sites
dembrandt example.com --brand-guide    # Generate a brand guide PDF
dembrandt example.com --design-md      # Generate a DESIGN.md file for AI agents
dembrandt example.com /pricing /docs   # Extract specific paths and merge results into one output
dembrandt example.com --crawl 5        # Analyze 5 pages (homepage + 4 discovered pages), merges results
dembrandt example.com --sitemap        # Discover pages from sitemap.xml instead of DOM links
dembrandt example.com --crawl 10 --sitemap # Combine: up to 10 pages discovered via sitemap
dembrandt example.com --no-sandbox     # Disable Chromium sandbox (required for Docker/CI)
dembrandt example.com --browser=firefox # Use Firefox instead of Chromium (better for Cloudflare bypass)
dembrandt example.com --wcag           # WCAG 2.1 contrast analysis — real DOM pairs, AA/AAA grades
dembrandt example.com --stealth        # Opt-in anti-detection: navigator spoofing + human mouse simulation (use only when authorized)
dembrandt example.com --locale fi-FI --timezone Europe/Helsinki  # Browser fingerprint: locale and timezone
dembrandt example.com --user-agent "Mozilla/5.0 ..."            # Custom user agent string
dembrandt example.com --accept-language "fi,en;q=0.9"           # Custom Accept-Language header
dembrandt example.com --screen-size 2560x1440                   # Physical screen resolution to report
```

Default: formatted terminal display only. Use `--save-output` to persist results as JSON files. Browser automatically retries in visible mode if headless extraction fails.

### Multi-Page Extraction

Analyze multiple pages to get a more complete picture of a site's design system. Results are merged into a single unified output with cross-page confidence boosting: tokens appearing on multiple pages get higher confidence scores.

```bash
# Analyze homepage + 4 auto-discovered pages (default: 5 total)
dembrandt example.com --crawl 5

# Use sitemap.xml for page discovery instead of DOM link scraping
dembrandt example.com --sitemap

# Combine both: up to 10 pages from sitemap
dembrandt example.com --crawl 10 --sitemap
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
npx playwright@$(node -p "require('playwright-core/package.json').version") install firefox
```

### W3C Design Tokens (DTCG) Format

Use `--dtcg` to export in the standardized [W3C Design Tokens Community Group](https://www.designtokens.org/) format:

```bash
dembrandt example.com --dtcg
# Saves to: output/example.com/TIMESTAMP.tokens.json
```

The DTCG format is an industry-standard JSON schema that can be consumed by design tools and token transformation libraries like [Style Dictionary](https://styledictionary.com).

### DESIGN.md

Use `--design-md` to generate a [DESIGN.md](https://stitch.withgoogle.com/docs/design-md) file, a plain-text design system document readable by AI agents. The export follows Google's DESIGN.md draft format: YAML design tokens in front matter plus ordered Markdown guidance sections.

```bash
dembrandt example.com --design-md
# Saves to: output/example.com/DESIGN.md
```

DESIGN.md reports only what Dembrandt observed on the source site. Exact values (colors, typography, spacing, radii, shadows) live in the YAML front matter when available, and the Markdown body adds human-readable context. Sections with no extracted evidence are omitted rather than filled with invented defaults. For example, the elevation section is dropped when the site uses no box-shadow tokens.

### WCAG Contrast Analysis

Use `--wcag` to check accessibility contrast ratios across the page. Unlike palette-based checkers, dembrandt walks the actual DOM and finds what color is rendered on top of what background — per element.

```bash
dembrandt dembrandt.com --wcag
```

Returns every text/background pair with contrast ratio and WCAG 2.1 grade (AA, AA-Large, AAA, or fail), sorted by how often each pair appears. Results are shown in terminal and included in JSON output as `wcag`.

Also captures **interactive state contrast**: dembrandt simulates hover, focus, and disabled states on buttons, links, and inputs and checks contrast on each state. State pairs are tagged `[hover]`, `[focus]`, or `[disabled]` in output so you can catch contrast failures that only appear on interaction.

### Motion Tokens

Motion tokens are extracted automatically on every run — no flag needed. Dembrandt analyzes CSS transitions and animations across the page and returns a structured motion profile.

```bash
dembrandt dembrandt.com
```

Returns:
- **Duration scale**: all unique animation durations found on the page
- **Easing curves**: named easing types (ease-out, spring, custom cubic-bezier) with usage counts
- **Per-context profiles**: motion behavior by component type (button, nav, card, modal, hero)
- **Hover interaction deltas**: which properties animate on hover (transform, opacity, background, color) and the pattern (scale-up, fade-in, color-shift, slide-y)

Motion data is included in JSON output as `motion` and printed in terminal under a dedicated Motion section.

### Brand Guide PDF

Use `--brand-guide` to generate a printable PDF summarizing the extracted design system: colors, typography, components, and logo on a single document.

```bash
dembrandt example.com --brand-guide
# Saves to: output/example.com/TIMESTAMP.brand-guide.pdf
```

## Brand Drift Detection

Track design token changes over time. Save a baseline, re-run on any deploy, catch drift before it ships.

### Setup

```bash
# Save your baseline — extracts tokens and writes .dembrandt/ (config.json + snapshot.yaml + tokens.json)
dembrandt init example.com

# Multi-page baseline (recommended — more representative token coverage)
dembrandt init example.com --crawl 5

# Check for drift against baseline
dembrandt drift
```

Commit `.dembrandt/` to your repo. The snapshot is ~6KB — no LFS needed.

`dembrandt drift` re-extracts the same pages recorded during `init`, compares against the snapshot, and reports what changed. Exit code `1` on drift above threshold — works in CI without extra config.

### CI/CD Integration

Run drift detection on every push to `main`:

```yaml
# .github/workflows/brand-drift.yml
on:
  push:
    branches: [main]

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g dembrandt
      - run: npx playwright@$(node -p "require('playwright-core/package.json').version") install --with-deps chromium
      - run: dembrandt drift
```

### Drift output

```
✗ Drift   score 14/100 · threshold 10   example.com
  baseline 1 Jun 2026, 09:12  →  now 4 Jun 2026, 14:30

  color
    ~ accent     ▇ #533afd → ▇ #635bff   Δ8.2
    - accent     ▇ #ff6118  (2 uses)

  typography
    ~ h1         size 56px → 48px   family + weight unchanged

  2 changes — over threshold, failing the check
```

Colors are compared using ΔE (perceptual color distance). Brand-critical colors (`accent`, `primary`) are weighted higher than structural colors (`surface`, `background`). Spacing and radii use percentage change. Typography matches by semantic context.

### Configuration

`.dembrandt/config.json` is written by `dembrandt init`. Edit thresholds to tune sensitivity:

```json
{
  "baseline": "https://example.com",
  "pages": ["/", "/pricing", "/about"],
  "thresholds": {
    "color": 2.3,
    "spacing": 4,
    "typography": 0
  }
}
```

`color` threshold is a ΔE value — 2.3 is the just-noticeable difference. `spacing` is a percentage change. `typography: 0` means any change flags.

### Lint config

`dembrandt --lint` runs a set of design rules out of the box (no config needed):

- **primary-contrast** — the brand primary colour is legible on white (WCAG AA + margin).
- **button-contrast** — solid buttons have readable text (WCAG AA 4.5:1); outline/ghost buttons are skipped.
- **body-text-size** — body copy is at least 16px.
- **palette-size** — at most 8 accent/brand colours (skipped for data-viz pages).
- **typography-scale** — font sizes follow a consistent modular ratio.
- **radius-consistency** — border-radius values form a scale (pills excluded).
- **shadow-scale** — shadows form a limited elevation scale.
- **button-variants** — buttons share a limited set of styles.
- **focus-visible** — form inputs have a visible focus state (WCAG 2.4.7).
- **logo-format** — the logo is a vector (SVG), not a raster.

Rules read from the `lint` section of `.dembrandt/config.json` and follow the ESLint `[level, options]` model — set a rule to `"off"` to disable it, or override its level (`"error"`, `"warn"`, `"info"`) and options:

```json
{
  "lint": {
    "rules": {
      "primary-contrast": ["error", { "min": 4.5 }],
      "button-contrast": ["error", { "min": 4.5 }],
      "palette-size": ["warn", { "max": 8 }],
      "typography-scale": "off"
    }
  }
}
```

Without a config file, lint uses built-in defaults. `dembrandt init` seeds the section with those defaults so the editable form is discoverable. Note: a primary contrast below 3.0:1 is an outright WCAG AA failure and is always reported as `error` regardless of the configured level.

Override the baseline URL for staging environments (same design, different environment — localhost, staging, prod):

```bash
dembrandt drift --url https://staging.example.com
dembrandt drift --url http://localhost:3000
```

### Per-page drift

By default `drift` compares the merged whole-site baseline. To check specific pages against their own per-page baseline (e.g. four pages are fine and you only changed one), use `--pages` against a multi-page baseline (`dembrandt init --crawl`):

```bash
dembrandt drift --pages /checkout            # compare just /checkout to its own snapshot
dembrandt drift --pages /checkout /pricing   # several specific pages
```

Each page is compared to its own snapshot, so one changed page does not drown in the whole-site average. A page that is not in the baseline is reported as **new** — check it against the token contract with `dembrandt conformance <url>/newpage` instead, since there is no prior snapshot to drift against.

Get raw JSON output for custom reporting:

```bash
dembrandt drift --json
```

### Conformance: check live against a declared contract

`drift` is symmetric — it flags any change from a snapshot. `conformance` is one-directional: it checks that every token your contract *declares* is present in the live site. Extra tokens in live are not violations. Use it to enforce a curated token contract (`.dembrandt/tokens.json`) rather than a captured snapshot.

```bash
dembrandt conformance example.com                       # check live vs .dembrandt/tokens.json
dembrandt conformance example.com --contract ./tokens.json
dembrandt conformance example.com --contract ./DESIGN.md  # DESIGN.md front matter as contract
dembrandt conformance --threshold 0                     # fail on any missing token
```

The contract can be a `tokens.json`, a `DESIGN.md` (its YAML front matter is mapped to tokens), or a plain YAML file.

Exit code is 1 when the contract is violated, so it works as a CI gate alongside `drift` and `--lint`. The comparison is **unweighted** — the contract carries no usage counts or roles, so every declared token counts equally. The conformance score is not comparable to a drift score.

## Continuous integration

Dembrandt drives a real browser, so two things matter in CI: the browser revision must match `playwright-core`, and the rendering environment must match the one your baseline was captured in.

**Recommended adoption pattern**

- **`--lint` is the gate.** It is deterministic and largely rendering-independent, so it fails the build reliably.
- **`drift` is non-blocking until the baseline is captured in the same environment.** A baseline captured on macOS and checked on Linux produces false typography drift (fonts render with different metrics per OS). Run it with `continue-on-error` until you have a CI-captured baseline, then make it a gate.

```yaml
jobs:
  design:
    runs-on: ubuntu-latest
    # Browser preinstalled; tag MUST match dembrandt's playwright-core version.
    container: mcr.microsoft.com/playwright:v1.60.0-jammy
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build && npm run start & npx --yes wait-on -t 60000 http://localhost:3000

      - name: Lint design tokens (gate)
        run: npx dembrandt http://localhost:3000 --lint --no-sandbox

      - name: Token drift (non-blocking until baseline is captured in CI)
        continue-on-error: true
        run: npx dembrandt drift --no-sandbox
```

**Browser version**

If you are not using the Playwright container image, install the browser revision that matches `playwright-core`:

```bash
# in dembrandt's own repo
npm run install-browser
# elsewhere — derive the version so it always matches
npx playwright@$(node -p "require('playwright-core/package.json').version") install --with-deps chromium
```

A mismatched version fails with "Executable doesn't exist". The container image avoids this entirely — just match its tag (`v1.60.0`) to the `playwright-core` version.

**Capturing the baseline in CI**

Drift baselines are environment-specific. Capture the baseline on the same OS as the check (Linux), commit `.dembrandt/`, then drift against it. Capture it from your Mac inside the matching container so the metrics line up with CI:

```bash
docker run --rm -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.60.0-jammy \
  npx dembrandt init https://your-preview-url --no-sandbox
git add .dembrandt && git commit -m "chore: capture drift baseline (linux)"
```

Refresh it deliberately (a reviewed PR), or accept a single changed page with `dembrandt drift --pages /x -y` run in the same container. Once the baseline is Linux-captured, drop `continue-on-error` and `drift` becomes a real gate.

## Recipes

**Quick brand scan**
```bash
dembrandt dembrandt.com
```

**Compare two sites**
```bash
dembrandt dembrandt.com --save-output
dembrandt braintree.com --save-output
# Compare output/dembrandt.com and output/braintree.com side by side
```

**Multi-page audit** — get a fuller picture across the whole site
```bash
dembrandt dembrandt.com --crawl 10 --sitemap --save-output
```

**Spot-check a value** — verify a specific token fast
```bash
dembrandt dembrandt.com --json-only | grep -i "border-radius"
```

**Export for Tailwind** — get spacing and color values into your config
```bash
dembrandt dembrandt.com --dtcg --save-output
# Use the .tokens.json with Style Dictionary to generate tailwind.config.js
```

**Export for Tokens Studio / Figma**
```bash
dembrandt dembrandt.com --dtcg --save-output
# Import the .tokens.json directly into Tokens Studio
```

**Generate DESIGN.md for your AI agent**
```bash
dembrandt dembrandt.com --design-md
# Point your agent at the output DESIGN.md
```

**Accessibility audit** — check contrast on any live URL
```bash
dembrandt dembrandt.com --wcag
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
