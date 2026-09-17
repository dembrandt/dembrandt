# Usage

```bash
dembrandt <url>                        # Basic extraction (terminal display only)
dembrandt dembrandt.com --json-only     # Output raw JSON to terminal (no formatted display, no file save)
dembrandt dembrandt.com --save-output   # Save JSON to output/dembrandt.com/YYYY-MM-DDTHH-MM-SS.json
dembrandt dembrandt.com --dtcg          # Export in W3C Design Tokens (DTCG) format (auto-saves as .tokens.json)
dembrandt dembrandt.com --color-format=oklch # Notation for displayed colors: hex|rgb|lch|oklch|source (default: hex)
dembrandt dembrandt.com --dark-mode     # Extract colors from dark mode variant
dembrandt dembrandt.com --mobile        # Use mobile viewport (390x844) for responsive analysis
dembrandt dembrandt.com --slow          # 3x longer timeouts (24s hydration) for JavaScript-heavy sites
dembrandt dembrandt.com --brand-guide   # Generate a brand guide PDF
dembrandt dembrandt.com --design-md     # Generate a DESIGN.md file for AI agents
dembrandt dembrandt.com --tailwind      # Write a Tailwind v4 @theme CSS file (observed values only)
dembrandt dembrandt.com /pricing /docs  # Extract specific paths and merge results into one output
dembrandt dembrandt.com --crawl 5       # Analyze 5 pages (homepage + 4 discovered pages), merges results
dembrandt dembrandt.com --sitemap       # Discover pages from sitemap.xml instead of DOM links
dembrandt dembrandt.com --crawl 10 --sitemap # Combine: up to 10 pages discovered via sitemap
dembrandt dembrandt.com --no-sandbox    # Disable Chromium sandbox (required for Docker/CI)
dembrandt dembrandt.com --key dmb_···  # Push snapshot to your Dembrandt account; auto-scored against the previous snapshot for that domain
                                       # DEMBRANDT_API_URL env var overrides the upload endpoint (default: https://www.dembrandt.com)
dembrandt dembrandt.com --browser=firefox # Use Firefox instead of Chromium (better for Cloudflare bypass)
dembrandt dembrandt.com --wcag          # WCAG 2.1 contrast analysis, real DOM pairs, AA/AAA grades
dembrandt dembrandt.com --stealth       # Opt-in anti-detection: navigator spoofing + human mouse simulation (use only when authorized)
dembrandt dembrandt.com --locale fi-FI --timezone Europe/Helsinki # Browser fingerprint: locale and timezone
dembrandt dembrandt.com --user-agent "Mozilla/5.0 ..."           # Custom user agent string
dembrandt dembrandt.com --accept-language "fi,en;q=0.9"          # Custom Accept-Language header
dembrandt dembrandt.com --screen-size 2560x1440                  # Physical screen resolution to report
```

Default: formatted terminal display only. Use `--save-output` to persist results as JSON files. Browser automatically retries in visible mode if headless extraction fails.

`--color-format` is presentational and covers terminal output only: the palette, borders and every component section print the notation you pick. `source` shows a declared token as it was authored. The JSON payload is unaffected (it carries hex, rgb, lch and oklch for every color regardless), so `--json-only`, `--save-output`, `--dtcg`, `--design-md`, `--html` and `--brand-guide` are untouched, and drift comparisons stay stable across notations. The CLI warns when you combine it with one of those.

All flags combine unless noted otherwise: see [FLAGS.md](FLAGS.md) for the flag compatibility tables (interactions, ignored combinations, multi-page propagation).

## Multi-Page Extraction

Analyze multiple pages to get a more complete picture of a site's design system. Results are merged into a single unified output with cross-page confidence boosting: tokens appearing on multiple pages get higher confidence scores.

```bash
# Analyze homepage + 4 auto-discovered pages (default: 5 total)
dembrandt dembrandt.com --crawl 5

# Use sitemap.xml for page discovery instead of DOM link scraping
dembrandt dembrandt.com --sitemap

# Combine both: up to 10 pages from sitemap
dembrandt dembrandt.com --crawl 10 --sitemap
```

**Page discovery** works two ways:
- **DOM links** (default): Reads navigation, header, and footer links from the homepage, prioritizing key pages like /pricing, /about, /features
- **Sitemap** (`--sitemap`): Parses sitemap.xml (checks robots.txt first), follows sitemapindex references, and scores URLs by importance

Pages are fetched sequentially with polite delays. Failed pages are skipped without aborting the run.

## Browser Selection

By default, dembrandt uses Chromium. If you encounter bot detection or timeouts (especially on sites behind Cloudflare), try Firefox which is often more successful at bypassing these protections:

```bash
# One-time: install-browser defaults to chromium, so fetch firefox explicitly
dembrandt install-browser firefox

# Use Firefox instead of Chromium
dembrandt dembrandt.com --browser=firefox

# Combine with other flags
dembrandt dembrandt.com --browser=firefox --save-output --dtcg
```

**When to use Firefox:**
- Sites behind Cloudflare or other bot detection systems
- Timeout issues on heavily protected sites
- WSL environments where headless Chromium may struggle

**Installation:**
Browsers are installed on demand, not by `npm install` (dembrandt depends on the lean `playwright-core`, which carries no browser binaries). Fetch the engine you need, matched to the installed `playwright-core`:

```bash
dembrandt install-browser           # chromium (default)
dembrandt install-browser firefox   # a specific engine
```

This resolves the browser revision from the `playwright-core` dembrandt actually drives, so the two cannot drift apart. Prefer it over calling Playwright directly: a bare `npx playwright install` fetches whatever version the registry serves, and a mismatch fails with `Executable doesn't exist`.

On Linux and in CI, system libraries are installed separately:

```bash
npx playwright@$(node -p "require('playwright-core/package.json').version") install --with-deps chromium
```

## Connect to an existing browser (CDP)

Skip the bundled browser entirely and drive an already-running Chromium over the DevTools Protocol. Useful in CI or containers where a browser is already up, and it needs no local browser download at all:

```bash
BROWSER_CDP_ENDPOINT=http://localhost:9222 dembrandt dembrandt.com --browser chromium
```

CDP is supported only with `--browser chromium`.

## W3C Design Tokens (DTCG) Format

Use `--dtcg` to export in the standardized [W3C Design Tokens Community Group](https://www.designtokens.org/) format:

```bash
dembrandt dembrandt.com --dtcg
# Saves to: output/dembrandt.com/TIMESTAMP.tokens.json
```

The DTCG format is an industry-standard JSON schema that can be consumed by design tools and token transformation libraries like [Style Dictionary](https://styledictionary.com).

## DESIGN.md

Use `--design-md` to generate a [DESIGN.md](https://stitch.withgoogle.com/docs/design-md) file, a plain-text design system document readable by AI agents. The export follows Google's DESIGN.md draft format: YAML design tokens in front matter plus ordered Markdown guidance sections.

```bash
dembrandt dembrandt.com --design-md
# Saves to: output/dembrandt.com/DESIGN.md
```

DESIGN.md reports only what Dembrandt observed on the source site. Exact values (colors, typography, spacing, radii, shadows) live in the YAML front matter when available, and the Markdown body adds human-readable context. Sections with no extracted evidence are omitted rather than filled with invented defaults. For example, the elevation section is dropped when the site uses no box-shadow tokens.

## Tailwind theme

Use `--tailwind` to write a Tailwind v4 `@theme` block you can drop into a new project's CSS entry point.

```bash
dembrandt dembrandt.com --tailwind
# Saves to: output/dembrandt.com/theme.css

dembrandt dembrandt.com --tailwind src/app.css   # or write it straight into a project
```

```css
@import "tailwindcss";

@theme {
  --color-primary: #ea580c;
  --text-display: 96px;
  --text-display--line-height: 1;
  --spacing: 8px;
  --radius-lg: 8px;
  --breakpoint-md: 700px;
}
```

The file contains **only values observed on the page**. No 50–950 shade ramps, no interpolated scale steps, no derived hover or on-color variants: an invented shade is indistinguishable from a measured one once it is in the file, and this export is meant as the starting point you extend by hand. Colors keep their semantic role name (`--color-primary`), or the author's own custom property name where the page declares one; the rest are numbered `--color-brand-N`. Tailwind's defaults still apply to everything not listed, so the block extends the theme rather than replacing it.

Spacing is emitted as v4's `--spacing` multiplier when the page has a recognizable base-N rhythm, and as named steps otherwise. Values with a usage count (spacing, radii) are selected by how often they appear, not by size, so sub-pixel one-offs stay out of the scale.

v4 only. The output is plain CSS custom properties, so nothing you install depends on or pins Tailwind; a v3 `tailwind.config.js` emitter would be a second serialization of the same data and is not written until someone needs it. Tailwind is a devDependency here purely so the test suite can run the real compiler over the emitted theme and assert that every token produces the utility it claims to, which is the only check that catches a namespace spelled plausibly but wrongly.

A scheduled `Tailwind Watch` workflow runs weekly. It checks for a new major, which is the event that can invalidate the theme namespaces used here, and separately recompiles the emitted theme against the latest published Tailwind so a minor that changes what a namespace means cannot pass unnoticed behind the pinned devDependency. Either signal hands the update to an agent, which verifies each namespace against the current docs and opens a PR; it falls back to opening an issue if no agent credential is configured.

## shadcn/ui theme

```bash
dembrandt dembrandt.com --shadcn
# Saves to: output/dembrandt.com/shadcn.css
```

Writes the `:root` block and the `@theme inline` mapping shadcn needs under
Tailwind v4. Values are oklch, which is what shadcn's own theme uses; a
translucent value is kept as authored, because the alpha is the token.

A slot is written only when the page supplied it. Anything not observed is
listed in the file header and left to shadcn's default, so a theme is never
padded out with plausible values that read as measured. Across the corpus,
background, foreground, primary, border and radius land on almost every site;
popover and destructive land on none.

One run renders one colour scheme, so one run writes one block. `--dark-mode`
produces the `.dark` block.

## WCAG Contrast Analysis

Use `--wcag` to check accessibility contrast ratios across the page. Unlike palette-based checkers, dembrandt walks the actual DOM and finds what color is rendered on top of what background, per element.

```bash
dembrandt dembrandt.com --wcag
```

Returns every text/background pair with contrast ratio and WCAG 2.1 grade (AA, AA-Large, AAA, or fail), sorted by how often each pair appears. Results are shown in terminal and included in JSON output as `wcag`.

Also captures **interactive state contrast**: dembrandt simulates hover, focus, and disabled states on buttons, links, and inputs and checks contrast on each state. State pairs are tagged `[hover]`, `[focus]`, or `[disabled]` in output so you can catch contrast failures that only appear on interaction.

## Motion Tokens

Motion tokens are extracted automatically on every run, no flag needed. Dembrandt analyzes CSS transitions and animations across the page and returns a structured motion profile.

```bash
dembrandt dembrandt.com
```

Returns:
- **Duration scale**: all unique animation durations found on the page
- **Easing curves**: named easing types (ease-out, spring, custom cubic-bezier) with usage counts
- **Per-context profiles**: motion behavior by component type (button, nav, card, modal, hero)
- **Hover interaction deltas**: which properties animate on hover (transform, opacity, background, color) and the pattern (scale-up, fade-in, color-shift, slide-y)

Motion data is included in JSON output as `motion` and printed in terminal under a dedicated Motion section.

## ML-powered brand color detection (experimental)

```bash
dembrandt dembrandt.com --ai
#   ⚡ ML primary → #533afd (score 0.93 · 68% acc)
```

Replaces the heuristic with a trained model, 2× more accurate (68% vs 32%). Requires the optional `onnxruntime-node` dep (`npm install onnxruntime-node`). Without the flag nothing changes.

## Brand Guide PDF

Use `--brand-guide` to generate a printable PDF summarizing the extracted design system: colors, typography, components, and logo on a single document.

```bash
dembrandt dembrandt.com --brand-guide
# Saves to: output/dembrandt.com/TIMESTAMP.brand-guide.pdf
```

## Color Confidence

- High: Logo, primary interactive elements
- Medium: Secondary interactive elements, icons, navigation
- Low: Generic UI components (filtered from display)
- Only shows high and medium confidence colors in terminal. Full palette in JSON.
