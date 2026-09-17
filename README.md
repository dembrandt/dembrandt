# Dembrandt.

[![npm version](https://img.shields.io/npm/v/dembrandt.svg)](https://www.npmjs.com/package/dembrandt)
[![npm downloads](https://img.shields.io/npm/dm/dembrandt.svg)](https://www.npmjs.com/package/dembrandt)
[![license](https://img.shields.io/npm/l/dembrandt.svg)](https://github.com/dembrandt/dembrandt/blob/main/LICENSE)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-me-pink?style=flat&logo=github-sponsors)](https://github.com/sponsors/dembrandt)

Extract any website's design system in one command. Enforce it in CI.

Logo, colors, typography, spacing, borders, shadows, motion, components. W3C design tokens in seconds.

![Dembrandt: Any website to design tokens](https://raw.githubusercontent.com/dembrandt/dembrandt/main/docs/images/banner.png)

## Install

```bash
npm install -g dembrandt
dembrandt install-browser        # one-time: fetches the matching Chromium
dembrandt dembrandt.com
```

The browser step is required. dembrandt drives Chromium through `playwright-core`,
which ships no browser binaries, so a fresh install has nothing to launch until you
run it. Skipping it fails with `browser engine not available`.

Or use npx without installing: `npx dembrandt dembrandt.com`. The browser step applies
here too: run `npx dembrandt install-browser` first. Browsers land in a shared
Playwright cache, so either route only needs it once.

Requires Node.js 18+

## What you get

- Colors (semantic, palette, CSS variables, gradients)
- Typography (fonts, sizes, weights, sources, font file URLs)
- Spacing (margin/padding scales)
- Borders (radius, widths, styles, colors)
- Shadows
- Motion (duration scale, easing curves, hover patterns per component type)
- Components (buttons, badges, inputs, links)
- Breakpoints
- Icons & frameworks

Playwright renders the page, dembrandt reads computed styles from the DOM, analyzes color usage and confidence, groups similar typography, detects spacing patterns, and returns design tokens.

## Common flags

```bash
dembrandt dembrandt.com --save-output   # Save JSON to output/dembrandt.com/TIMESTAMP.json
dembrandt dembrandt.com --dtcg          # W3C Design Tokens (DTCG) export, for Style Dictionary or Tokens Studio
dembrandt dembrandt.com --design-md     # DESIGN.md for AI agents
dembrandt dembrandt.com --tailwind      # Tailwind v4 @theme CSS, observed values only
dembrandt dembrandt.com --wcag          # WCAG 2.1 contrast, real DOM pairs with AA/AAA grades
dembrandt dembrandt.com --crawl 10      # Merge 10 pages into one output, cross-page confidence boosting
dembrandt dembrandt.com --slow          # 3x timeouts for JavaScript-heavy sites
```

Default is formatted terminal output only. Full flag reference in **[docs/usage.md](docs/usage.md)**: mobile and dark mode, browser selection and CDP, brand guide PDF, motion tokens, fingerprint options.

## Catch design drift in CI

Extract a preview deployment, compare against a committed baseline, fail the job when tokens moved:

```yaml
- uses: dembrandt/dembrandt@v0.33.0
  with:
    url: https://preview.example.com
    baseline: .dembrandt/baseline.json
```

The action annotates the PR with the drifted tokens. On any other runner the gate is just an exit code plus JSON: `dembrandt URL --compare baseline.json --json-only` exits 1 on drift and prints per-token `changes[]`. See **[docs/ci.md](docs/ci.md)** for the Action inputs, the platform-neutral gate, and the exit code table.

## Recipes

Copy a command, paste a prompt, get a result. Competitor benchmarking, WCAG audits, Figma token push, agentic design system builds. Filterable by role at **[dembrandt.com/recipes](https://www.dembrandt.com/recipes)**, with the basics in [docs/recipes.md](docs/recipes.md).

## AI Agent Integration (MCP)

Use Dembrandt as a tool in Claude Code, Cursor, Windsurf, or any MCP-compatible client. Ask your agent to "extract the color palette from dembrandt.com" and it calls Dembrandt automatically.

```bash
claude mcp add --transport stdio dembrandt -- npx -y --package dembrandt dembrandt-mcp
```

Or add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "dembrandt": {
      "command": "npx",
      "args": ["-y", "--package", "dembrandt", "dembrandt-mcp"]
    }
  }
}
```

Available tools include `get_design_tokens`, `get_color_palette`, `get_typography`, `get_component_styles`, `get_surfaces`, `get_spacing`, and `get_brand_identity`, plus pure analysis tools (`compute_drift`, `get_findings`, `export_dtcg`, `generate_design_md`, `render_report`) and job-control tools.

Extraction tools accept `slow`, `mobile`, `darkMode`, `wcag`, `cookie` and `header` (for authenticated pages), `userAgent`, and `noSandbox` (Docker and most CI containers). Set `pages` above 1 to crawl and merge several pages, which produces a markedly stronger token set than one page; `paths` names them explicitly and `sitemap` discovers them from sitemap.xml.

Extraction returns a `job_id`. Poll it with `get_job_status`, then hand that same id to the pure tools instead of passing the extraction back as an argument:

```
get_design_tokens(url: "example.com", pages: 5)  ->  job_id
get_job_status(job_id)                           ->  tokens
get_findings(job_id)                             ->  contrast and consistency issues
export_dtcg(job_id)                              ->  W3C design tokens
```

Pair with **[dembrandt-skills](https://github.com/dembrandt/dembrandt-skills)** to give your agent UX intelligence on top of extracted tokens: hierarchy, accessibility, interaction states, and a full 6-stage design pipeline orchestrator.

```bash
npx skills add dembrandt/dembrandt-skills
```

## Dembrandt App (Beta)

Load extractions, track token drift, and compare snapshots. **[dembrandt.com/app](https://www.dembrandt.com/app)**

* **Automatic drift tracking from CI.** Generate an API key at [dembrandt.com/app/api-keys](https://www.dembrandt.com/app/api-keys), then pass `--key` to the CLI. Every run uploads a snapshot to your account and scores it against the previous one for that domain. Wire into GitHub Actions or any CI runner and every deploy records itself.
* **Pin a baseline.** Mark any snapshot as your reference. Every subsequent extraction is automatically scored against it.
* **Visual diff.** Color swatches, before/after values, delta scores per category: colors, typography, spacing, radius, shadows.
* **Snapshot timeline.** Proportional timeline per domain, scrub across any date range from days to years.
* **Compare side by side.** Load multiple extractions into one view: two releases, two sites, or two surfaces.
* **Copy tokens.** Paste values straight into Copilot, Claude, or Cursor.
* **No login required for local use.** Data stays in the browser. Sign in with GitHub to enable cloud sync.

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

## Sponsors

The CLI is MIT-licensed and free. Sponsorship funds the enforcement layer: a committed project-level token baseline, `--compare` and the ingest API for CI/CD drift gates, and the App platform (snapshot history, team drift dashboard, alerts to Slack, Linear, and GitHub).

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-me-pink?style=flat&logo=github-sponsors)](https://github.com/sponsors/dembrandt)

<!-- sponsors -->
<!-- Backer ($25+) and Lead sponsor ($500+) logos appear here. -->
<!-- sponsors -->

## Documentation

- [docs/usage.md](docs/usage.md): every flag, multi-page extraction, browser selection, CDP, DTCG, DESIGN.md, Tailwind theme, WCAG, motion, brand guide PDF
- [docs/ci.md](docs/ci.md): GitHub Action, drift gate, exit codes
- [docs/recipes.md](docs/recipes.md): copy-paste workflows
- [docs/FLAGS.md](docs/FLAGS.md): flag interactions, ignored combinations, multi-page propagation

## Contributing

Bugs, weird sites, pull requests. All welcome.

Open an [Issue](https://github.com/dembrandt/dembrandt/issues) or PR.

@thevangelist

MIT. Do whatever you want with it.


## 🌐 Web Resources & Aesthetic Symbols Index
- [SYM 1D47D](https://scholarly-type-fonts-40.pages.dev/symbol/sym-1d47d/)
- [SAGITTARIUS ZODIAC ARCHER](https://cyber-clan-tags-23.pages.dev/symbol/sagittarius-zodiac-archer/)
- [FOUR POINT STAR SPARKLE](https://sleek-unicode-art-69.pages.dev/symbol/four-point-star-sparkle/)
- [SYM 1F61D](https://vintage-script-symbols-65.pages.dev/symbol/sym-1f61d/)
- [SYM 2734](https://gothic-bio-fonts-14.pages.dev/symbol/sym-2734/)
- [SYM 26CD](https://minimal-star-symbols-54.pages.dev/symbol/sym-26cd/)
- [SYM 1D463](https://gothic-bio-fonts-13.pages.dev/symbol/sym-1d463/)
- [SYM 2731](https://cyber-clan-tags-23.pages.dev/symbol/sym-2731/)
- [MUSIC WEATHER](https://clean-aesthetic-fonts-33.pages.dev/ru/music-weather/)
- [TIKTOK CAPTIONS](https://manga-speech-symbols-95.pages.dev/es/tiktok-captions/)
- [SYM 26C2](https://kawaii-kaomoji-hub-96.pages.dev/symbol/sym-26c2/)
- [SYM 267B](https://neon-glitch-fonts-20.pages.dev/symbol/sym-267b/)
- [SYM 1F620](https://techwear-bio-symbols-45.pages.dev/symbol/sym-1f620/)
- [ZODIAC CELESTIAL](https://vintage-angel-text-38.pages.dev/pt/zodiac-celestial/)
- [SYM 1D49D](https://ribbon-bow-unicode-18.pages.dev/symbol/sym-1d49d/)
- [SYM 26AF](https://angelic-ribbon-text-78.pages.dev/symbol/sym-26af/)
- [SYM 2671](https://alchemist-symbol-hub-29.pages.dev/symbol/sym-2671/)
- [SYM 2612](https://cyber-clan-tags-23.pages.dev/symbol/sym-2612/)
- [DAGGER CROSS SYMBOL](https://neon-futuristic-symbols-62.pages.dev/symbol/dagger-cross-symbol/)
- [SYM 1D413](https://clean-aesthetic-fonts-73.pages.dev/symbol/sym-1d413/)
- [SYM 26AE](https://coquette-aesthetic-symbols-51.pages.dev/symbol/sym-26ae/)
- [SYM 1D464](https://ribbon-bow-unicode-18.pages.dev/symbol/sym-1d464/)
- [SYM 2639 FE0F](https://kawaii-kaomoji-hub-96.pages.dev/symbol/sym-2639-fe0f/)
- [CLEAN AESTHETIC FONTS 33.PAGES.DEV](https://clean-aesthetic-fonts-33.pages.dev/)
- [SYM 26F9](https://anime-sparkle-text-22.pages.dev/symbol/sym-26f9/)
- [SYM 1D412](https://kawaii-kaomoji-hub-51.pages.dev/symbol/sym-1d412/)
- [ROBLOX NAMES](https://minimal-star-symbols-25.pages.dev/ru/roblox-names/)
- [SYM 26C4](https://angelic-ribbon-text-78.pages.dev/symbol/sym-26c4/)
- [SYM 1D49F](https://sleek-line-unicode-29.pages.dev/symbol/sym-1d49f/)
- [SYM 1F611](https://minimal-star-symbols-25.pages.dev/symbol/sym-1f611/)
- [SYM 2637](https://glitch-mecha-kaomoji-69.pages.dev/symbol/sym-2637/)
- [SYM 1F63B](https://synthwave-text-art-35.pages.dev/symbol/sym-1f63b/)
- [SYM 1F622](https://cyber-clan-tags-90.pages.dev/symbol/sym-1f622/)
- [SYM 1F924](https://clean-aesthetic-fonts-73.pages.dev/symbol/sym-1f924/)
- [SYM 1D480](https://baroque-crown-unicode-60.pages.dev/symbol/sym-1d480/)
- [BLACK FOUR POINT STAR](https://mecha-crosshair-tags-20.pages.dev/symbol/black-four-point-star/)
- [SYM 1FAE1](https://cyberpunk-clan-tags-43.pages.dev/symbol/sym-1fae1/)
- [SYM 1FAE4](https://vintage-lace-symbols-65.pages.dev/symbol/sym-1fae4/)
- [SYM 2637](https://monochrome-text-lab-86.pages.dev/symbol/sym-2637/)
- [SYM 2670](https://angelic-ribbon-text-78.pages.dev/symbol/sym-2670/)
- [SYM 2732](https://alchemical-symbol-hub-52.pages.dev/symbol/sym-2732/)
- [SYM 1F635](https://mecha-crosshair-tags-20.pages.dev/symbol/sym-1f635/)
- [SYM 268D](https://mecha-crosshair-tags-20.pages.dev/symbol/sym-268d/)
- [SYM 1F49B](https://clean-aesthetic-fonts-33.pages.dev/symbol/sym-1f49b/)
- [BLACK FOUR POINT STAR](https://cyber-clan-tags-90.pages.dev/symbol/black-four-point-star/)
- [SYM 2614](https://neon-matrix-symbols-94.pages.dev/symbol/sym-2614/)
- [SYM 1D404](https://neon-futuristic-symbols-58.pages.dev/symbol/sym-1d404/)
- [SYM 1D484](https://anime-sparkle-text-81.pages.dev/symbol/sym-1d484/)
- [SYM 265E](https://baroque-crown-unicode-60.pages.dev/symbol/sym-265e/)
- [SYM 26BB](https://techno-hacker-text-43.pages.dev/symbol/sym-26bb/)
- [LEFT RIGHT EXCHANGE ARROWS](https://kawaii-kaomoji-hub-51.pages.dev/symbol/left-right-exchange-arrows/)
- [SYM 1F62E](https://baroque-crown-unicode-60.pages.dev/symbol/sym-1f62e/)
- [SYM 1D481](https://coquette-aesthetic-symbols-62.pages.dev/symbol/sym-1d481/)
- [ARROWS LINES](https://minimal-star-symbols-54.pages.dev/ja/arrows-lines/)
- [SYM 265C](https://mecha-crosshair-tags-20.pages.dev/symbol/sym-265c/)
- [SYM 1F976](https://mecha-crosshair-tags-20.pages.dev/symbol/sym-1f976/)
- [SYM 2749](https://anime-sparkle-text-22.pages.dev/symbol/sym-2749/)
- [SYM 1D41A](https://coquette-aesthetic-symbols-62.pages.dev/symbol/sym-1d41a/)
- [SYM 1D483](https://modern-bullet-symbols-45.pages.dev/symbol/sym-1d483/)
- [SYM 1F47E](https://kawaii-kaomoji-hub-96.pages.dev/symbol/sym-1f47e/)
- [FIRST QUARTER WAXING MOON](https://cyber-clan-tags-90.pages.dev/symbol/first-quarter-waxing-moon/)
- [SYM 2681](https://alchemical-symbol-hub-52.pages.dev/symbol/sym-2681/)
- [SYM 1D40B](https://vintage-coquette-text-58.pages.dev/symbol/sym-1d40b/)
- [SYM 1D40A](https://clean-aesthetic-fonts-73.pages.dev/symbol/sym-1d40a/)
- [CANCER ZODIAC CRAB](https://neon-futuristic-symbols-62.pages.dev/symbol/cancer-zodiac-crab/)
- [SYM 26C1](https://coquette-aesthetic-symbols-51.pages.dev/symbol/sym-26c1/)
- [BORDERS DIVIDERS](https://pastel-chibi-emotes-23.pages.dev/borders-dividers/)
- [MUSIC WEATHER](https://neon-glitch-fonts-20.pages.dev/vi/music-weather/)
- [SYM 1D47A](https://neon-gamer-symbols-64.pages.dev/symbol/sym-1d47a/)
- [SYM 26FA](https://dolly-kaomoji-text-94.pages.dev/symbol/sym-26fa/)
- [RIGHT BLACK LENTICULAR BRACKET](https://clean-aesthetic-fonts-33.pages.dev/symbol/right-black-lenticular-bracket/)
- [SYM 1F60B](https://sleek-bio-symbols-51.pages.dev/symbol/sym-1f60b/)
- [SYM 1F601](https://anime-sparkle-text-81.pages.dev/symbol/sym-1f601/)
- [SYM 1D429](https://anime-sparkle-text-22.pages.dev/symbol/sym-1d429/)
- [SYM 1D492](https://minimal-star-symbols-87.pages.dev/symbol/sym-1d492/)
- [SYM 1F62D](https://anime-sparkle-text-81.pages.dev/symbol/sym-1f62d/)
- [UPWARD DIAGONAL ARROW](https://coquette-symbols.pages.dev/symbol/upward-diagonal-arrow/)
- [SYM 2654](https://mecha-crosshair-tags-20.pages.dev/symbol/sym-2654/)
- [SYM 2639](https://mecha-crosshair-tags-20.pages.dev/symbol/sym-2639/)
- [CLOUD WEATHER SYMBOL](https://techno-hacker-text-43.pages.dev/symbol/cloud-weather-symbol/)
- [SYM 26AE](https://alchemical-symbol-hub-52.pages.dev/symbol/sym-26ae/)
- [SYM 1D424](https://neon-gamer-symbols-64.pages.dev/symbol/sym-1d424/)
- [BLACK FLORETTE FLOWER](https://glitch-font-studio-46.pages.dev/symbol/black-florette-flower/)
- [SYM 1F60B](https://baroque-crown-unicode-60.pages.dev/symbol/sym-1f60b/)
- [LEFT MATHEMATICAL WHITE SQUARE BRACKET](https://anime-sparkle-text-81.pages.dev/symbol/left-mathematical-white-square-bracket/)
- [SYM 2723](https://pink-ribbon-fonts-28.pages.dev/symbol/sym-2723/)
- [SYM 26DE](https://pearl-girly-fonts-86.pages.dev/symbol/sym-26de/)
- [SYM 1D460](https://coquette-aesthetic-symbols-52.pages.dev/symbol/sym-1d460/)
- [SYM 2728](https://neon-matrix-symbols-94.pages.dev/symbol/sym-2728/)
- [SYM 26EE](https://ribbon-bow-unicode-18.pages.dev/symbol/sym-26ee/)
- [SYM 2672](https://mecha-crosshair-tags-20.pages.dev/symbol/sym-2672/)
- [SYM 268B](https://angelic-soft-text-59.pages.dev/symbol/sym-268b/)
- [SYM 1F49A](https://mecha-crosshair-tags-20.pages.dev/symbol/sym-1f49a/)
- [SYM 1F62E 200D 1F4A8](https://neon-futuristic-symbols-58.pages.dev/symbol/sym-1f62e-200d-1f4a8/)
- [SYM 1D4A0](https://ribbon-bow-unicode-18.pages.dev/symbol/sym-1d4a0/)
- [SYM 2677](https://zen-aesthetic-fonts-87.pages.dev/symbol/sym-2677/)
- [SYM 1D40F](https://coquette-aesthetic-symbols-62.pages.dev/symbol/sym-1d40f/)
- [SYM 1F498](https://angelic-ribbon-text-78.pages.dev/symbol/sym-1f498/)
- [SYM 1F61B](https://anime-sparkle-text-81.pages.dev/symbol/sym-1f61b/)
- [SYM 26F6](https://glitch-mecha-kaomoji-69.pages.dev/symbol/sym-26f6/)
- [GAMING WEAPONS](https://anime-sparkle-text-22.pages.dev/pt/gaming-weapons/)
- [SYM 1F976](https://baroque-crown-unicode-60.pages.dev/symbol/sym-1f976/)
- [SYM 1D449](https://alchemical-symbol-hub-52.pages.dev/symbol/sym-1d449/)
- [SYM 1D433](https://neon-matrix-symbols-94.pages.dev/symbol/sym-1d433/)
- [SYM 26E7](https://clean-line-emojis-93.pages.dev/symbol/sym-26e7/)
- [SYM 1F639](https://mecha-crosshair-tags-20.pages.dev/symbol/sym-1f639/)
- [SYM 1D400](https://scholarly-cross-symbols-35.pages.dev/symbol/sym-1d400/)
- [SAGITTARIUS ZODIAC ARCHER](https://soft-bow-fonts-22.pages.dev/symbol/sagittarius-zodiac-archer/)
- [SYM 2685](https://alchemical-symbol-hub-52.pages.dev/symbol/sym-2685/)
- [SYM 1D49A](https://mecha-crosshair-tags-20.pages.dev/symbol/sym-1d49a/)
- [SYM 2625](https://clean-aesthetic-fonts-33.pages.dev/symbol/sym-2625/)
- [SYM 265A](https://dolly-kaomoji-text-94.pages.dev/symbol/sym-265a/)
- [SYM 1D406](https://anime-sparkle-text-22.pages.dev/symbol/sym-1d406/)
- [ROBLOX NAMES](https://angelic-ribbon-text-78.pages.dev/pt/roblox-names/)
- [SYM 1F627](https://anime-sparkle-text-22.pages.dev/symbol/sym-1f627/)
- [SYM 1D453](https://angelic-ribbon-text-78.pages.dev/symbol/sym-1d453/)
- [SYM 26BD](https://coquette-aesthetic-symbols-51.pages.dev/symbol/sym-26bd/)
- [RIGHT BLACK LENTICULAR BRACKET](https://kawaii-kaomoji-hub-51.pages.dev/symbol/right-black-lenticular-bracket/)
- [SYM 267F](https://clean-aesthetic-fonts-73.pages.dev/symbol/sym-267f/)
- [SYM 1D42E](https://coquette-aesthetic-symbols-51.pages.dev/symbol/sym-1d42e/)
- [SYM 1D469](https://ribbon-bow-unicode-18.pages.dev/symbol/sym-1d469/)
- [SYM 1D417](https://neon-gamer-symbols-64.pages.dev/symbol/sym-1d417/)
- [SYM 2655](https://mecha-crosshair-tags-20.pages.dev/symbol/sym-2655/)
- [SYM 1F63C](https://cyber-clan-tags-23.pages.dev/symbol/sym-1f63c/)
- [SYM 1D479](https://angelic-ribbon-text-78.pages.dev/symbol/sym-1d479/)
- [SYM 2676](https://vintage-coquette-text-58.pages.dev/symbol/sym-2676/)
- [SYM 1D41A](https://minimal-star-symbols-54.pages.dev/symbol/sym-1d41a/)
- [SYM 1D45C](https://coquette-aesthetic-symbols-86.pages.dev/symbol/sym-1d45c/)
- [SYM 1D478](https://mecha-crosshair-tags-20.pages.dev/symbol/sym-1d478/)
- [SYM 1F60D](https://mecha-crosshair-tags-20.pages.dev/symbol/sym-1f60d/)
