# Changelog

## Unreleased

### Fixed
- Drift compares `colors.semantic` role by role. The engine read that map only to attach role labels to palette entries, so a changed brand primary produced no drift at all: a rebrand that promotes a colour the page already used leaves the palette set identical and reported stable (DEM-208). Changes now appear as `semantic.<role>`, and `docs/FLAGS.md` no longer describes `--ai` primary drift the engine could not see

### Changed
- Output contract at schema 1.8.0. No shape change; colour scores rise wherever a semantic role moved, so a baseline whose primary differs from the candidate's starts reporting it on upgrade. Measured churn on upgrade is 0 for dembrandt.com and stripe.com (threshold 10): a site whose roles did not move scores exactly as before, and only a genuinely moved role costs anything. If an existing baseline does flip your gate red, the role really did change: read it in the report and re-approve once with `--compare <baseline> --approve`

## [0.28.0] - 2026-08-13

### Added
- `--color-format=hex|rgb|lch|oklch|source` selects the notation for displayed colors. Presentational: it covers the palette, borders and every component section in the terminal, and leaves the JSON payload alone, which carries every notation regardless. `source` prints a declared token as it was authored. Export paths ignore it and the CLI says so (#155)
- `typography.styles` entries carry `count`, the number of elements rendering that exact style
- `typography.sources.filteredFamilies` lists families dropped by the usage floor
- `typography.sources.urls` lists the resolved http(s) font asset and webfont-provider stylesheet URLs seen during extraction, sorted and deduped, so a consumer can re-fetch or verify the real font files (#147)
- `--tailwind [path]` writes a Tailwind v4 `@theme` CSS file. Observed values only: no shade ramps, no interpolated scale steps, no derived states. Colors keep their semantic role or the page's own custom property name; spacing collapses to v4's `--spacing` multiplier when the page has a base-N rhythm
- `npm run tailwind:check` and a weekly `Tailwind Watch` workflow open an issue when a new Tailwind major is published, which is the only event that can invalidate the emitted theme namespaces

### Changed
- Output contract at schema 1.7.0. 1.6.0 added `typography.sources.urls`, which no consumer had to adapt to; 1.7.0 moves existing values (see Fixed)
- Merged multi-page runs sort the font URL union, so page order cannot reach the output

### Fixed
- Palette confidence has a usage floor, as spacing and radii always had. A color seen once caps at low, twice at medium, and high needs three occurrences whatever its context score. Hover and focus colors keep medium: their single occurrence is provenance, not a usage claim
- `body` ends at the 24px reading range. Non-heading text above it takes the existing `text` role, so hero copy stops landing on the body token
- A font family covering under 2% of counted text (minimum 3 elements) is dropped from `styles` and listed in `sources.filteredFamilies`, which removes faces that third-party embeds drag onto a page. dembrandt.com goes from six families to the two it uses

### Upgrading
- **Baselines churn once.** The three fixes above move colour and typography values. Measured on dembrandt.com against a 0.27.1 extraction: drift 15 against a threshold of 10. Re-approve with `--compare <baseline> --approve`, or regenerate baselines, on first run after upgrading

## [0.25.1] - 2026-07-28

### Fixed
- The main entry and the `./dtcg` and `./normalize` subpaths now declare their type definitions. `dist` already shipped the `.d.ts` files, but without a `types` condition consumers importing `dembrandt` resolved no types at all

### Changed
- `no-explicit-any` is an eslint error with an explicit allowlist of pre-existing files, and `npm run lint` runs with `--max-warnings 0`, so no new file can introduce one
- `release.yml` installs chromium before the unit suite. The consent tests drive a real page, so the v0.25.0 release job failed and skipped downstream sync
- Dependabot ignores TypeScript majors until typescript-eslint accepts them, so one blocked package no longer fails the whole group

## [0.25.0] - 2026-07-26

### Added
- Consent dismissal now sweeps child iframes and pierces open shadow roots, reaching iframe-hosted CMPs (Sourcepoint, TrustArc, Quantcast, Cookiebot) and shadow-DOM CMPs (Usercentrics, Osano, CookieYes) that the main-document pass could not (#129)

### Changed
- Framework detection anchors class-prefix selectors (`fa-`, `uk-`, `p-`, `ms-`, `q-`, `el-`) instead of substring matching, and requires real `data-radix-*` markers; removes false positives from Tailwind and unrelated utility classes (#125)
- Cloud hint is a single line with a clickable recipe link (#126)
- Dependencies upgraded: commander 15, ora 9, @types/node 26, and the GitHub Actions used by CI. `--help` grouping now uses commander's own item formatter after `Help.wrap` was removed in commander 15; rendered output is unchanged
- Dependabot groups every update into one PR per ecosystem, monthly, instead of one PR per package

### Security
- All 8 reported advisories cleared (5 high). The vulnerable packages are transitive under `@modelcontextprotocol/sdk` (hono, @hono/node-server, fast-uri, body-parser) and `onnxruntime-node` (adm-zip), both already at their latest release, so patched versions are pinned via npm `overrides` rather than by downgrading the roots. `npm audit` reports 0 vulnerabilities

### Removed
- Golden-baseline `qa.mjs` and `gold:*` harness layers; replaced by a minimal liveness smoke and `release:churn`. Accuracy ground truth lives in dembrandt-ml (#127)

## [0.24.0] - 2026-07-18

### Changed
- Drift comparison: validity warnings, scoring calibration, meta provenance (schema 1.3.0) (#123)

### Fixed
- `install-browser` installs the Playwright version matched to the resolved CLI; corrected CI docs (#124)

### Refactored
- Brand-guide: split the HTML builder from the PDF generator (#122)

## [0.23.1] - 2026-07-10

### Fixed
- MCP server: `@modelcontextprotocol/sdk` and `zod` ship as regular dependencies. As optional peers they broke the documented install — `npx -y --package dembrandt dembrandt-mcp` exited with McpDepsMissingError on every clean machine (0.21.0–0.23.0), and npx never installs optional peers (#120)

## [0.23.0] - 2026-07-10

### Changed
- Logo extraction reworked for recall and precision, measured against 103 human-judged sites: recall 0.64 -> 0.67, and known non-logos proposed cut from 11/21 to 4/21 (total proposals 206 -> 178). Concretely: header-zone selection no longer loses to cookie-dialog/modal `[class*=header]` elements; inline-`<svg>` logos wrapped in a home link are found (previously only `<img>` was); below-fold and footer logos that link home now qualify; symbol+wordmark lockups are kept as separate instances instead of collapsing to one; customer/partner-wall logos (detected structurally as a group of >=3 sizable marks in one content container) and 16-20px UI icons are no longer proposed; logos linking to a localized homepage (/en, /de) are recognized as the site's own
- Each logo instance now reports a `rect` (the painted on-screen box, correct for `object-fit`/`preserveAspectRatio` letterboxing, padding, border and transforms) alongside the existing intrinsic `width`/`height`; a `natural` field carries the asset's intrinsic size

### Added
- `lib/extractors/logo-heuristics.ts`: the pure, DOM-free logo decisions (home-link, position→context, third-party-brand detection, painted-box geometry, minimum logo size), serialized into the page so the browser runs the exact same code, with 30 unit tests
- MCP server: three pure analysis tools — `get_findings` (design-system lint: contrast, consistency, duplication), `export_dtcg` (W3C Design Tokens export), `generate_design_md` (DESIGN.md brand guide) — plus `list_jobs` for the async queue
- MCP extraction tools accept `mobile`, `cookie` (authenticated pages), and `wcag` (contrast analysis) options; `get_design_tokens` gains `darkMode`
- Official GitHub Action for the CI drift gate (DEM-151, #116)
- Flag orthogonality: multi-page propagation, wcag merge, save/dtcg split (`--save-output`), compatibility docs (#113)

### Fixed
- Removed an accidentally committed `node_modules` symlink and hardened `.gitignore` against symlinks (#119)

## [0.21.0] - 2026-06-29

### Changed
- Hidden-content reveal (open click-toggle menus/dropdowns, advance carousels, then re-scan) is now standard and on by default. Closed panels and off-screen slides hold brand colours that the static scan never sees, so this materially improves colour recall. Set `DEMBRANDT_DISABLE_REVEAL=1` to skip it, which QA baselines do to stay deterministic
- Colour extraction recovers card/section/input/badge colours previously lost to structural filtering, and lifts colours from ancestor context, footers, and carousel-revealed panels (DEM-68)

### Added
- `./findings` subpath export exposes the high-recall detected colour set for the ML pipeline, separate from the scored brand palette

### Removed
- `--menus` opt-in flag. The reveal pass it gated is now the default, so the flag is redundant

## [0.20.1] - 2026-06-26

### Added
- `--stealth` spoofs the WebGL renderer and audio fingerprint so extraction survives stricter bot detection (#100)

### Fixed
- Near-white primary and transparent secondary colours are guarded against, so washed-out or invisible picks no longer surface as brand colours (DEM-112, DEM-113, #103)
- Cloud upload targets `www.dembrandt.com` and is overridable via the `DEMBRANDT_API_URL` env var

## [0.20.0] - 2026-06-23

### Added
- `--key` pushes each extraction to your Dembrandt account and auto-scores it against the previous snapshot for that domain (#105)
- `--ai` predicts the brand primary colour with a trained ML model, replacing the heuristic when enabled (roughly 2x accuracy)
- Platform-specific colour hints: `theme-color`, `mask-icon`, and `msapplication` meta values now feed the palette (#101)

### Fixed
- SVG logo fill/stroke colours are extracted from the logo's own elements (DEM-111, #102)
- Core hardening and internal refinements across extraction (#99)

## [0.19.5] - 2026-06-14

### Fixed
- Drift comparison now ignores `confidence: "low"` radius and shadow tokens — single-use, margin-of-detection elements the extractor is unsure about that surfaced inconsistently between extractions and produced phantom drift

### Added
- The CLI run summary now reflects the active flags and explicit paths of the run (DEM-99)

## [0.19.4] - 2026-06-14

### Fixed
- Self-hosted font lists (`selfHostedFonts`, `customFonts`) are now deduped and sorted, so two extractions of the same page no longer differ by font order — eliminating phantom design drift

### Added
- `--approve` accepts the current extraction as the new baseline: with `--compare <file>`, it overwrites that local baseline and passes instead of failing. App baseline ids are read-only
- `--compare` combined with `--json-only` now attaches the full drift report (score, status, summary, per-token changes) under a `drift` key, so CI gates can render what changed from structured data instead of scraping the HTML report

## [0.17.1] - 2026-06-10

### Fixed
- Colour-valued `:root` custom properties are now captured regardless of their name, so brand tokens not named with `color`/`bg`/`text`/`brand` are no longer silently dropped
- Framework default-theme palettes exposed as `--colors-<hue>-<shade>` custom properties no longer flood the extracted CSS variables
- Status/utility-only colours (error/danger, framework warm utilities) no longer leak into the brand palette unless declared as a token or used as a recurring CTA background
- `:root` custom-property colours are treated as brand tokens: never dropped as structural, always considered for the palette, and preferred when selecting the primary colour as a bonus over usage rather than an override

## [0.12.0] - 2026-05-10

### Fixed
- Link and text colors (e.g. `#0070e0`) were incorrectly filtered out when they never appeared as background colors — chromatic text-only colors with sufficient semantic context are now retained
- Header and single-instance brand background colors were dropped on large sites where element count pushed the frequency threshold too high — high-scoring colors now bypass the count threshold
- Modern CSS color functions (`oklab`, `oklch`, `lch`, `lab`, `color()`) were leaking into the palette as unparseable strings — these are now rejected at all extraction paths including hover/focus state merging

## [0.11.0] - 2026-04-11

### Changed
- Neutralized documentation terminology
- Removed third-party brand examples from test fixtures
- Added `.claudeignore` for AI tool safety

### Removed
- Brand challenge test suite (replaced with QA baseline tests)
- Third-party brand screenshots and example outputs

## [0.3.0] - 2025-11-24

### Added
- `--slow` flag for slow-loading sites with 3x longer timeouts
- Tailwind CSS exporter (`lib/exporters.js`)
- QA test suite for visual comparison and regression detection
- GitHub Actions CI workflow for automated testing
- Border detection with confidence scoring

### Changed
- Improved terminal output with tree structure
- Enhanced retry logic for empty content
- Better SPA hydration detection
- Test suite refocused on SPA and interactive sites
- Lowered content validation threshold from 500 to 100 chars for minimal-text sites
- Clearer border style display with `(per-side)` label for shorthand values
- Shadows now sorted by confidence and usage frequency (most confident first)
- Button detection now includes outline/bordered buttons (previously skipped transparent backgrounds)

## [0.2.0] - 2025-11-22

### Added
- `--dark-mode` and `--mobile` flags
- Clickable terminal links
- Enhanced bot detection avoidance

## [0.1.0] - 2025-11-21

Initial public release
