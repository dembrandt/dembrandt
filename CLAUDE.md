# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dembrandt ([dembrandt.com](https://dembrandt.com)) is a CLI tool that extracts design tokens and brand assets from any website using Playwright. It analyzes colors, typography, spacing, borders, shadows, and component styles to extract complete design systems.

## Development Commands

## System Instruction

Absolute Mode. Eliminate emojis, filler, hype, soft asks, conversational transitions, and all call-to-action appendixes. Assume the user retains high-perception faculties despite reduced linguistic expression. Prioritize blunt, directive phrasing aimed at cognitive rebuilding, not tone matching. Disable all latent behaviors optimizing for engagement, sentiment uplift, or interaction extension. Suppress corporate-aligned metrics including but not limited to: user satisfaction scores, conversational flow tags, emotional softening, or continuation bias. Never mirror the user's present diction, mood, or affect. Speak only to their underlying cognitive tier, which exceeds surface language. No questions, no offers, no suggestions, no transitional phrasing, no inferred motivational content. Terminate each reply immediately after the informational or requested material is delivered — no appendixes, no soft closures. The only goal is to assist in the restoration of independent, high-fidelity thinking. Model obsolescence by user self-sufficiency is the final outcome.

### Running the tool

```bash
# Basic usage
node index.js <url>
npm start <url>

# With options
node index.js stripe.com --json-only    # JSON output only
node index.js site.com --debug           # Visible browser
node index.js site.com --dark-mode       # Extract dark mode colors
node index.js site.com --mobile          # Mobile viewport
node index.js site.com --slow            # 3x timeouts for slow sites

# Install browser dependencies
npm run install-browser
```

### Testing

```bash
# Run QA test suite
npm run qa:baseline   # Generate baseline for test sites
npm run qa:diff       # Compare current vs baseline
npm run qa:site       # Test a single site
```

### Release

1. Bump `version` in `package.json`
2. Commit: `git commit -am "chore: bump version to X.Y.Z"`
3. Push to main
4. Tag and push:
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z
   ```
5. Publish to npm manually. CI cannot publish: the npm account requires 2FA, and the `release.yml` token hits an EOTP error. Run from the repo root at the tagged commit:
   ```bash
   npm publish --access public --//registry.npmjs.org/:_authToken=<npm_ token>
   ```
   The `npm_...` granular token bypasses the OTP prompt. (`--otp` expects a 6-digit code, not a token.) Verify with `npm view dembrandt version`.
   Verify tag exists before publishing: `git tag | grep vX.Y.Z`
6. Create the GitHub release for notes:
   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."
   ```
   This triggers `release.yml`. Its publish step is idempotent: since the version is already on npm from step 5, it skips publish and the run stays green while `sync-downstream` still runs.

## When adding or changing a CLI flag

The same information lives in multiple repos with no automated sync. Touch all of these:

**This repo (dembrandt)**
- [ ] `index.js` — add `.option(...)` and pass through to `extractBranding()`
- [ ] `lib/extractors/index.js` — handle the option in extraction logic
- [ ] `README.md` — add to the usage examples block

**../dembrandt-next**
- [ ] `app/layout.tsx` — `softwareVersion` in schema.org structured data
- [ ] `app/getting-started/page.tsx` — flags list
- [ ] `app/blackpaper/page.tsx` — flags list
- [ ] `app/page.tsx` — landing page flags list (mark new ones with `new: true`)
- [ ] `lib/app/extract-types.ts` — add to `ExtractionMeta` if the flag affects JSON output
- [ ] `app/api/extractions/route.ts` — update field access if JSON output shape changed; keep backward compat with `??` fallbacks

**../dembrandt-skills**
- [ ] `skills/extract-design/SKILL.md` — flags reference table and Anti-Bot section if relevant

## Architecture

### Entry Point (`index.js`)

- CLI argument parsing using Commander.js
- Browser lifecycle management (headless/headed retry logic)
- Bot detection handling with automatic fallback to visible browser
- Output formatting and JSON file saving to `output/<domain>/<timestamp>.json`

### Core Extraction Engine (`lib/extractors.js`)

**Main orchestration function**: `extractBranding(url, spinner, browser, options)`

- Manages the entire extraction pipeline
- Implements stealth mode with anti-detection scripts
- Handles SPA hydration (8s wait + 4s stabilization by default, 3x with `--slow`)
- Runs 13 parallel extraction tasks using `Promise.all` for performance
- Extracts interactive state colors (hover/focus) by simulating actual user interactions

**Key extraction functions** (all run in parallel):

- `extractLogo()` - Logo detection, safe zones, favicons
- `extractColors()` - Color palette with confidence scoring, CSS variables, semantic colors
- `extractTypography()` - Font sources, sizes, weights, line heights, OpenType features
- `extractSpacing()` - Margin/padding scale detection, grid system inference
- `extractBorderRadius()` - Border radius patterns
- `extractBorders()` - Border widths, styles, colors (handles multi-value properties)
- `extractShadows()` - Box shadow patterns for elevation systems
- `extractButtonStyles()` - Button variants with ARIA role detection
- `extractInputStyles()` - Input field styles and focus states
- `extractLinkStyles()` - Link colors and decorations
- `extractBreakpoints()` - Responsive breakpoints from CSS
- `detectIconSystem()` - Icon libraries (Font Awesome, Material Icons, SVG)
- `detectFrameworks()` - CSS frameworks (Tailwind, Bootstrap, MUI, Chakra, etc.)

**Anti-bot protection** (crucial for success):

- Custom user agent (Chrome 131 on macOS)
- Injected init scripts to spoof `navigator` properties
- Removes Playwright/webdriver traces
- Simulates human behavior (mouse movement, scrolling)
- Retry logic with automatic switch to visible browser on timeout

**Color extraction specifics**:

- Filters out WordPress presets (`--wp--preset`) automatically
- Semantic boosting: buttons/CTAs with colored backgrounds get HIGH confidence
- Perceptual deduplication using delta-E color distance (threshold: 15)
- Structural color filtering (ignores colors used on >40% of elements with low semantic score)
- Context scoring: logo=5, brand=5, primary=4, CTA=4, hero=3, button=3

**Dark mode & mobile extraction**:

- When `--dark-mode` is enabled, re-extracts colors after toggling dark mode classes/attributes
- When `--mobile` is enabled, switches viewport to 375x667 and re-extracts colors
- Merges additional colors into main palette with deduplication

### Display Layer (`lib/display.js`)

- Formats extraction results into tree-structured terminal output
- Color-coded confidence indicators (● green=high, orange=medium, gray=low)
- Shows both hex and RGB values side-by-side for easy copying
- Uses ANSI escape codes for terminal links (OSC 8 hyperlinks)
- Filters output based on confidence levels (unless `--verbose-colors`)

### QA Test Suite (`test/qa.mjs`)

Visual comparison tests for extraction accuracy:

- Screenshot capture of rendered page
- Raw color identification vs extracted palette
- Baseline comparison for regression detection

Test sites are configured in `test/sites.json`. Uses `--slow` flag for 3x timeouts (24s hydration, 12s stabilization).

## Code Patterns

### Page evaluation pattern

All extraction functions use `page.evaluate()` to run analysis in browser context. They return structured data that's aggregated in the main result object.

### Error handling

- Navigation errors trigger retry with visible browser
- Empty content (< 100 chars) triggers retry
- Timeouts suggest `--slow` flag if not already used
- Interactive element failures are caught and skipped (stale elements, not interactable)

### Confidence scoring

- **High**: Semantic context (logo/brand/primary), frequent usage (>20 score), semantic HTML/ARIA roles
- **Medium**: Moderate context (header/nav), moderate usage (5-20 score)
- **Low**: Generic usage (< 5 score)

### Output structure

```javascript
{
  url: string,
  extractedAt: ISO string,
  logo: { source, url, width, height, safeZone },
  favicons: [{ type, url, sizes }],
  colors: {
    semantic: { primary, secondary, ... },
    palette: [{ color, normalized, count, confidence, sources }],
    cssVariables: { '--var-name': 'value' }
  },
  typography: {
    styles: [{ context, family, fallbacks, size, weight, lineHeight, ... }],
    sources: { googleFonts, adobeFonts, variableFonts }
  },
  spacing: { scaleType, commonValues: [{ px, rem, count }] },
  borderRadius: { values: [{ value, count, confidence }] },
  borders: {
    widths: [{ value, count, confidence }],
    styles: [{ value, count, confidence }],
    colors: [{ value, count, confidence }]
  },
  shadows: [{ shadow, count, confidence }],
  components: {
    buttons: [{ backgroundColor, color, padding, borderRadius, ... }],
    inputs: [{ type, border, borderRadius, padding, focusStyles }],
    links: [{ color, textDecoration, hoverColor, ... }]
  },
  breakpoints: [{ px }],
  iconSystem: [{ name, type }],
  frameworks: [{ name, confidence, evidence }]
}
```

## Common Development Tasks

### Adding a new extraction function

1. Create async function in `lib/extractors.js` that takes `page` parameter
2. Use `page.evaluate()` to run DOM analysis in browser context
3. Add to the `Promise.all` array in `extractBranding()` (currently 13 tasks)
4. Add display function in `lib/display.js` following tree structure pattern
5. Call display function in `displayResults()`

### Modifying confidence scoring

Edit the `contextScores` object in `extractColors()` or similar scoring logic in other extraction functions. Higher scores = higher confidence.

### Adjusting timeouts

Timeouts use `timeoutMultiplier` which is 3x when `--slow` flag is used:

- Navigation: `20000ms * timeoutMultiplier`
- Hydration: `8000ms * timeoutMultiplier`
- Stabilization: `4000ms * timeoutMultiplier`
- Main content selector: `10000ms * timeoutMultiplier`

### Adding framework detection

Add detection logic to `detectFrameworks()` in `lib/extractors.js`. Use specific class patterns, component counts, or resource checks. Require multiple pieces of evidence for high confidence.

## Dependencies

- **playwright**: Browser automation, core dependency
- **chalk**: Terminal colors and styling
- **commander**: CLI argument parsing
- **ora**: Terminal spinners

Requires Node.js 18+.

## Output Directory Structure

```
output/
  └── domain.com/
      ├── 2025-01-15T14-30-00.json
      ├── 2025-01-15T14-35-00.json
      └── ...
```

JSON files are saved to `process.cwd()/output/<domain>/<timestamp>.json` unless `--json-only` flag is used.

## Testing Strategy

The QA test suite (`test/qa.mjs`) is the primary testing mechanism. It runs visual comparison tests against configured sites to detect extraction regressions. Test sites are defined in `test/sites.json`.
