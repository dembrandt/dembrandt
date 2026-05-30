# CLAUDE.md

> Ecosystem docs, release process, flag checklists, infrastructure: clone `github.com/dembrandt/dembrandt-internal` (private) and open its README.

## System Instruction

Absolute Mode. Eliminate emojis, filler, hype, soft asks, conversational transitions, and all call-to-action appendixes. Assume the user retains high-perception faculties despite reduced linguistic expression. Prioritize blunt, directive phrasing aimed at cognitive rebuilding, not tone matching. Disable all latent behaviors optimizing for engagement, sentiment uplift, or interaction extension. Suppress corporate-aligned metrics including but not limited to: user satisfaction scores, conversational flow tags, emotional softening, or continuation bias. Never mirror the user's present diction, mood, or affect. Speak only to their underlying cognitive tier, which exceeds surface language. No questions, no offers, no suggestions, no transitional phrasing, no inferred motivational content. Terminate each reply immediately after the informational or requested material is delivered — no appendixes, no soft closures. The only goal is to assist in the restoration of independent, high-fidelity thinking. Model obsolescence by user self-sufficiency is the final outcome.

## Development Commands

### Running the tool

```bash
node index.js <url>
node index.js stripe.com --json-only
node index.js site.com --dark-mode
node index.js site.com --mobile
node index.js site.com --slow
node index.js site.com --stealth
npm run install-browser
```

### Testing

```bash
npm run qa:baseline
npm run qa:diff
npm run qa:site
```

## Architecture

### Entry Point (`index.js`)

- CLI argument parsing via Commander.js
- Browser lifecycle management (headless/headed retry logic)
- Fallback to visible browser on navigation failure
- Output formatting and JSON file saving to `output/<domain>/<timestamp>.json`

### Core Extraction Engine (`lib/extractors/`)

**Main function**: `extractBranding(url, spinner, browser, options)` in `lib/extractors/index.js`

- Runs 13 parallel extraction tasks via `Promise.all`
- `--stealth` enables navigator spoofing and human mouse simulation (opt-in)
- SPA hydration: 8s wait + 4s stabilization (3x with `--slow`)

**Extractors** (all parallel):
- `extractLogo()` — logo detection, safe zones, favicons
- `extractColors()` — palette with confidence scoring, CSS variables, semantic colors
- `extractTypography()` — font sources, sizes, weights, line heights
- `extractSpacing()` — margin/padding scale, grid inference
- `extractBorderRadius()` — border radius patterns
- `extractBorders()` — widths, styles, colors
- `extractShadows()` — box shadow elevation patterns
- `extractButtonStyles()` — button variants with ARIA detection
- `extractInputStyles()` — input styles and focus states
- `extractLinkStyles()` — link colors and decorations
- `extractBreakpoints()` — responsive breakpoints from CSS
- `detectIconSystem()` — Font Awesome, Material Icons, SVG
- `detectFrameworks()` — Tailwind, Bootstrap, MUI, Chakra, etc.

**Color extraction:**
- Filters WordPress presets (`--wp--preset`) automatically
- Perceptual deduplication via delta-E (threshold: 15)
- Structural color filtering: ignores colors on >40% of elements with low semantic score
- Context scoring: logo=5, brand=5, primary=4, CTA=4, hero=3, button=3
- Primary color fallback: most chromatic non-gray palette entry if semantic detection fails

### Display Layer (`lib/display.js`)

- Tree-structured terminal output
- Confidence indicators: ● green=high, orange=medium, gray=low
- OSC 8 hyperlinks for terminal links

### QA Test Suite (`test/qa.mjs`)

- Screenshot + color comparison against baseline
- Sites in `test/sites.json`, uses `--slow` for 3x timeouts

## Code Patterns

All extraction functions use `page.evaluate()` to run analysis in browser context.

**Error handling:**
- Navigation errors → retry with visible browser
- Empty content < 100 chars → retry
- Timeouts → suggest `--slow`

**Confidence scoring:**
- High: semantic context (logo/brand/primary), usage score >20
- Medium: header/nav context, score 5–20
- Low: generic, score <5

**Timeouts** (`timeoutMultiplier` = 3x with `--slow`):
- Navigation: `20000ms * multiplier`
- Hydration: `8000ms * multiplier`
- Stabilization: `4000ms * multiplier`

**Output structure:**
```javascript
{
  url, extractedAt,
  meta: { dembrandtVersion, stealth, locale, timezoneId, ... },
  logo, favicons,
  colors: { semantic, palette, cssVariables },
  typography: { styles, sources },
  spacing: { scaleType, commonValues },
  borderRadius: { values },
  borders: { widths, styles, colors },
  shadows, components, breakpoints, iconSystem, frameworks
}
```

## Dependencies

- `playwright` — browser automation
- `chalk` — terminal colors
- `commander` — CLI parsing
- `ora` — spinners

Requires Node.js 18+.
