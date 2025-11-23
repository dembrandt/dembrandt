# 🎨 Dembrandt

[![npm version](https://img.shields.io/npm/v/dembrandt.svg)](https://www.npmjs.com/package/dembrandt)
[![npm downloads](https://img.shields.io/npm/dm/dembrandt.svg)](https://www.npmjs.com/package/dembrandt)
[![license](https://img.shields.io/npm/l/dembrandt.svg)](https://github.com/thevangelist/dembrandt/blob/main/LICENSE)

A CLI tool for extracting design tokens and brand assets from any website. Powered by Playwright with advanced bot detection avoidance.

![Dembrandt Demo](showcase.png)

## Quick Start

```bash
npx dembrandt stripe.com
```

No installation required! Extract design tokens from any website in seconds. Or install globally with `npm install -g dembrandt`.

## What It Does

Dembrandt analyzes live websites and extracts their complete design system:

- **Logo** — Logo detection (img/svg) with dimensions and source URL
- **Favicons** — All favicon variants with sizes and types
- **Colors** — Semantic colors, color palette with confidence scoring, CSS variables (both hex and RGB formats)
- **Typography** — Font families, sizes, weights, line heights, font sources (Google Fonts, Adobe Fonts, custom)
- **Spacing** — Margin and padding scales with grid system detection (4px/8px/custom)
- **Border Radius** — Corner radius patterns with usage frequency
- **Shadows** — Box shadow values for elevation systems
- **Buttons** — Component styles with variants and states
- **Inputs** — Form field styles (input, textarea, select)
- **Links** — Link styles with hover states and decorations
- **Breakpoints** — Responsive design breakpoints from media queries
- **Icons** — Icon system detection (Font Awesome, Material Icons, SVG)
- **Frameworks** — CSS framework detection (Tailwind, Bootstrap, Material-UI, Chakra)

### 🎨 Figma Integration

Import extracted design systems directly into Figma with the included plugin:

- **Automatic Style Creation** — Generates Figma color and text styles from extracted tokens
- **Visual Documentation** — Creates organized pages showing your design system
- **Smart Naming** — Intelligently names styles based on semantic meaning
- **One-Click Import** — Simply paste JSON into the plugin to create your design system

Perfect for competitive analysis, brand audits, or rebuilding a brand when you don't have design guidelines.

## Why It Matters

**Designers** — Analyze competitor systems, document production tokens, audit brand consistency

**Developers** — Migrate design tokens, reverse engineer components, validate implementations

**Product Managers** — Track competitor evolution, quantify design debt, evaluate vendors

**Marketing** — Audit competitor brands, plan rebrands, monitor brand compliance

**Engineering Leaders** — Measure technical debt, plan migrations, assess acquisition targets

## How It Works

Uses Playwright to render the page, extracts computed styles from the DOM, analyzes color usage and confidence, groups similar typography, detects spacing patterns, and returns actionable design tokens.

### Extraction Process

1. **Browser Launch** - Launches Chromium with stealth configuration
2. **Anti-Detection** - Injects scripts to bypass bot detection
3. **Navigation** - Navigates to target URL with retry logic
4. **Hydration** - Waits for SPAs to fully load (8s initial + 4s stabilization)
5. **Content Validation** - Verifies page content is substantial (>500 chars)
6. **Parallel Extraction** - Runs all extractors concurrently for speed
7. **Analysis** - Analyzes computed styles, DOM structure, and CSS variables
8. **Scoring** - Assigns confidence scores based on context and usage

### Color Confidence

- **High** — Logo, brand elements, primary buttons
- **Medium** — Interactive elements, icons, navigation
- **Low** — Generic UI components (filtered from display)

Only shows high and medium confidence colors in terminal. Full palette in JSON.

### Typography Detection

Samples all heading levels (h1-h6), body text, buttons, links. Groups by font family, size, and weight. Detects Google Fonts, Adobe Fonts, custom @font-face.

### Framework Detection

Recognizes Tailwind CSS, Bootstrap, Material-UI, and others by class patterns and CDN links.

## Installation

### Using npx (Recommended)

No installation needed! Run directly with `npx`:

```bash
npx dembrandt stripe.com
```

The first run will automatically install Chromium (~170MB).

### Global Installation

Install globally for repeated use:

```bash
npm install -g dembrandt
dembrandt stripe.com
```

### Prerequisites

- Node.js 18 or higher

### Development Setup

For contributors who want to work on dembrandt:

```bash
git clone https://github.com/thevangelist/dembrandt.git
cd dembrandt
npm install
npm link
```

## Usage

### Basic Usage

```bash
# Using npx (no installation)
npx dembrandt <url>

# Or if installed globally
dembrandt <url>

# Examples
dembrandt stripe.com
dembrandt https://github.com
dembrandt tailwindcss.com
```

### Options

**`--json-only`** - Output raw JSON to stdout instead of formatted terminal display

```bash
dembrandt stripe.com --json-only > tokens.json
```

Note: JSON is automatically saved to `output/domain.com/` regardless of this flag.

**`-d, --debug`** - Run with visible browser and detailed logs

```bash
dembrandt stripe.com --debug
```

Useful for troubleshooting bot detection, timeouts, or extraction issues.

**`--verbose-colors`** - Show medium and low confidence colors in terminal output

```bash
dembrandt stripe.com --verbose-colors
```

By default, only high-confidence colors are shown. Use this flag to see all detected colors.

**`--dark-mode`** - Extract colors from dark mode

```bash
dembrandt stripe.com --dark-mode
```

Enables dark mode preference detection for sites that support it.

**`--mobile`** - Extract from mobile viewport

```bash
dembrandt stripe.com --mobile
```

Simulates a mobile device viewport for responsive design token extraction.

**`--figma`** - Generate Figma plugin-ready JSON output

```bash
dembrandt stripe.com --figma
```

Creates a Figma-compatible JSON file that can be imported into Figma using the Dembrandt Design System Importer plugin. This generates color styles, text styles, and visual documentation pages automatically.

The plugin-ready JSON is saved alongside the regular output with a `-figma.json` suffix.

📦 **Figma Plugin Setup:**
1. Clone or download this repository to access the [figma-plugin](./figma-plugin) folder
2. In Figma Desktop: **Plugins** → **Development** → **Import plugin from manifest...**
3. Navigate to the `figma-plugin` folder and select `manifest.json`
4. Run dembrandt with `--figma` flag: `dembrandt stripe.com --figma`
5. In Figma: **Plugins** → **Development** → **Dembrandt Design System Importer**
6. Copy and paste the generated `-figma.json` file content

See [figma-plugin/README.md](./figma-plugin/README.md) for detailed setup and usage documentation.

## Output

### Automatic JSON Saves

Every extraction is automatically saved to `output/domain.com/YYYY-MM-DDTHH-MM-SS.json` with:

- Complete design token data
- Timestamped for version tracking
- Organized by domain

Example: `output/stripe.com/2025-11-22T14-30-45.json`

### Terminal Output

Clean, formatted tables showing:

- Color palette with confidence ratings (with visual swatches)
- CSS variables with color previews
- Typography hierarchy with context
- Spacing scale (4px/8px grid detection)
- Shadow system
- Button variants
- Component style breakdowns
- Framework and icon system detection

### JSON Output Format

Complete extraction data for programmatic use:

```json
{
  "url": "https://example.com",
  "extractedAt": "2025-11-22T...",
  "logo": { "source": "img", "url": "...", "width": 120, "height": 40 },
  "colors": {
    "semantic": { "primary": "#3b82f6", ... },
    "palette": [{ "color": "#3b82f6", "confidence": "high", "count": 45, "sources": [...] }],
    "cssVariables": { "--color-primary": "#3b82f6", ... }
  },
  "typography": {
    "styles": [{ "fontFamily": "Inter", "fontSize": "16px", "fontWeight": "400", ... }],
    "sources": { "googleFonts": [...], "adobeFonts": false, "customFonts": [...] }
  },
  "spacing": { "scaleType": "8px", "commonValues": [{ "px": "16px", "rem": "1rem", "count": 42 }, ...] },
  "borderRadius": { "values": [{ "value": "8px", "count": 15, "confidence": "high" }, ...] },
  "shadows": [{ "shadow": "0 2px 4px rgba(0,0,0,0.1)", "count": 8, "confidence": "high" }, ...],
  "components": {
    "buttons": [{ "backgroundColor": "...", "color": "...", "padding": "...", ... }],
    "inputs": [{ "type": "input", "border": "...", "borderRadius": "...", ... }]
  },
  "breakpoints": [{ "px": "768px" }, ...],
  "iconSystem": [{ "name": "Font Awesome", "type": "icon-font" }, ...],
  "frameworks": [{ "name": "Tailwind CSS", "confidence": "high", "evidence": "class patterns" }]
}
```

## Examples

### Extract Design Tokens

```bash
# Analyze a single site (auto-saves JSON to output/stripe.com/)
dembrandt stripe.com

# View saved JSON files
ls output/stripe.com/

# Output to stdout for piping
dembrandt stripe.com --json-only | jq '.colors.semantic'

# Debug mode for difficult sites
dembrandt example.com --debug
```

### Compare Competitors

```bash
# Extract tokens from multiple competitors (auto-saved to output/)
for site in stripe.com square.com paypal.com; do
  dembrandt $site
done

# Compare color palettes from most recent extractions
jq '.colors.palette[] | select(.confidence=="high")' output/stripe.com/2025-11-22T*.json output/square.com/2025-11-22T*.json

# Compare semantic colors across competitors
jq '.colors.semantic' output/*/2025-11-22T*.json
```

### Integration with Design Tools

```bash
# Extract and convert to custom config format
dembrandt mysite.com --json-only | jq '{
  colors: .colors.semantic,
  fontFamily: .typography.sources,
  spacing: .spacing.commonValues
}' > design-tokens.json
```

## Use Cases

### Brand Audits

Extract and document your company's current design system from production websites.

### Competitive Analysis

Compare design systems across competitors to identify trends and opportunities.

### Design System Migration

Document legacy design tokens before migrating to a new system.

### Reverse Engineering

Rebuild a brand when original design guidelines are unavailable.

### Quality Assurance

Verify design consistency across different pages and environments.

## Advanced Features

### Bot Detection Avoidance

- Stealth mode with anti-detection scripts
- Automatic fallback to visible browser on detection
- Human-like interaction simulation (mouse movement, scrolling)
- Custom user agent and browser fingerprinting

### Smart Retry Logic

- Automatic retry on navigation failures (up to 2 attempts)
- SPA hydration detection and waiting
- Content validation to ensure page is fully loaded
- Detailed progress logging at each step

### Comprehensive Logging

- Real-time spinner with step-by-step progress
- Detailed extraction metrics (colors found, styles detected, etc.)
- Error context with URL, stage, and attempt information
- Debug mode with full stack traces

## Troubleshooting

### Bot Detection Issues

If you encounter timeouts or network errors:

```bash
dembrandt example.com --debug
```

This will automatically retry with a visible browser.

### Page Not Loading

Some sites require longer load times. The tool waits 8 seconds for SPA hydration, but you can modify this in the source.

### Empty Content

If content length is < 500 chars, the tool will automatically retry (up to 2 attempts).

### Debug Mode

Use `--debug` to see:

- Browser launch confirmation
- Step-by-step progress logs
- Full error stack traces
- Extraction metrics

## Limitations

- Dark mode requires `--dark-mode` flag (not automatically detected)
- Hover/focus states extracted from CSS (not fully interactive)
- Canvas/WebGL-rendered sites cannot be analyzed (e.g., Tesla, Apple Vision Pro demos)
- JavaScript-heavy sites require hydration time (8s initial + 4s stabilization)
- Some dynamically-loaded content may be missed
- Default viewport is 1920x1080 (use `--mobile` for responsive analysis)

## Architecture

```
dembrandt/
├── index.js              # CLI entry point, command handling
├── lib/
│   ├── extractors.js     # Core extraction logic with stealth mode
│   ├── display.js        # Terminal output formatting
│   └── figma-exporter.js # Figma format transformer
├── figma-plugin/         # Figma plugin (not published to npm)
│   ├── manifest.json     # Plugin configuration
│   ├── code.js           # Plugin logic
│   ├── ui.html           # Plugin UI
│   └── README.md         # Plugin documentation
├── output/               # Auto-saved JSON extractions (gitignored)
│   ├── stripe.com/
│   │   ├── 2025-11-22T14-30-45.json
│   │   └── 2025-11-22T14-30-45-figma.json
│   └── github.com/
│       └── 2025-11-22T14-35-12.json
├── package.json
└── README.md
```

## Ethics & Legality

Dembrandt extracts publicly available design information (colors, fonts, spacing) from website DOMs for analysis purposes. This falls under fair use in most jurisdictions (USA's DMCA § 1201(f), EU Software Directive 2009/24/EC) when used for competitive analysis, documentation, or learning.

**Legal:** Analyzing public HTML/CSS is generally legal. Does not bypass protections or violate copyright. Check site ToS before mass extraction.

**Ethical:** Use for inspiration and analysis, not direct copying. Respect servers (no mass crawling), give credit to sources, be transparent about data origin.

## Contributing

Issues and pull requests welcome. Please include:

- Clear description of the issue/feature
- Example URLs that demonstrate the problem
- Expected vs actual behavior

## License

MIT

## Roadmap

- [x] Dark mode extraction (via `--dark-mode` flag)
- [x] Mobile viewport support (via `--mobile` flag)
- [x] Clickable terminal links for modern terminals
- [ ] Animation/transition detection
- [ ] Interactive state capture (hover, focus, active)
- [ ] Multi-page analysis
- [ ] Configuration file support
