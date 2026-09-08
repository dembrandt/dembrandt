# Changelog

## [0.32.0] - 2026-09-08

Token accuracy fixes.

### Fixed
- Shadows were parsed by splitting the string on whitespace, so a computed shadow's leading colour was read as its `offsetX` and every multi-layer shadow was folded into one. A shared parser now reads both colour positions, `inset`, and omitted blur/spread (#200)
- Pill radii reached every output as `3.35544e+07px` and outranked the real radius scale. Normalised to `9999px`, with the counts merged when two spellings collapse (#204)
- `isFluid` tested the computed font size, already resolved to px at the capture viewport, so `clamp()` and viewport-relative ramps were never detected. Read from the authored declaration, including one level of `var()` indirection, which is how a fluid scale is normally written (#200, #205)
- Colour dominance counted elements, so many small glyphs outranked a hero fill. Painted background area is tracked alongside the count and exposed as `areaFrac` (#200)
- Typography reported the first family in the stack, which on a site with a numerals-only face is not the family that rendered the text. The first family whose `@font-face` covers Latin letters is reported instead; the skipped one stays in `fallbacks` (#205)
- A class where a rendering role qualifies "primary" (`foreground-primary`, `text-primary`) could claim `colors.semantic.primary`, last write winning (#205)
- The robots.txt check matched the `Dembrandt` group while the browser sent a plain Chrome User-Agent, so a site could allow or disallow by name with no effect. Every refusal also read as permission: an unreachable file was fail-open, and a bot wall answering 200 with HTML parsed into zero rules (#202)
- `colors._raw`, an internal scratch set, shipped in every extraction. Removed from the output and dropped at ingest, so stored snapshots stop carrying it (#203)
- Version stamps reported the renderer rather than the release that extracted, which is the release a value came from (#199)
- The compiled test suite was published inside the npm package: 172 files and 1.5 MB of a 3.4 MB install (#207)

### Added
- `code`, `pre`, `kbd` and `samp` are extracted under a `mono` context, so a mono face used only in code blocks is no longer invisible (#205)
- `DEMBRANDT_ENFORCE_ROBOTS=1` makes a disallow, or an unreadable robots.txt, skip the target with exit `4`. For scheduled jobs and server-side use, where nobody is deciding what may be fetched. The default stays advisory (#202)
- A crawl names the pages it took instead of reporting a count (#204)

### Changed
- robots.txt is read once per origin instead of up to four times per `--sitemap` run (#202)
- The Tailwind shadow ladder orders by depth (blur, offset, spread) rather than blur alone, so `--shadow-sm/md/lg/xl` can move for an unchanged site (#200)
- A DTCG shadow token's `$value` is an array when the shadow has more than one layer. A consumer reading `$value.offsetX` must branch on `Array.isArray` (#200)
- Schema 1.12.0. Measured churn against 0.31.1 is 7 and 6 against a threshold of 10 on two reference sites, the only difference being the added `mono` context, so no baseline needs re-approval

## [0.31.1] - 2026-09-02

### Fixed
- `ExtractionMeta` was missing `requestedUrl`, `contentLength`, `timeouts` and `crawl` in the TypeScript type, even though they've been in the actual JSON output since 1.9.0. A strict consumer importing `dembrandt/types` had no way to read them without a cast. Type-only change, no schema or runtime shape change (#194)

## [0.31.0] - 2026-09-02

Stability pass: colour math, hydration timing, and robots.txt coverage.

### Added
- `colors.palette` entries gain `contrastAgainst`, the observed WCAG pairs each colour was measured against, deduped by the other colour and sorted by ratio (#186)
- `meta` gains `requestedUrl`, `contentLength`, `timeouts` and `crawl` (technique, pages requested, pages found) for `--crawl`, `--sitemap` and explicit paths (#178)
- `meta` gains `robotsWarnings`. robots.txt is now checked for every page a multi-page crawl discovers, in both the CLI and the MCP server, not just the entry URL. A disallowed page is skipped and named here instead of extracted without a trace (#193)
- Typography sources gain resolved font asset and webfont stylesheet URLs (#180)

### Fixed
- WCAG contrast pairs and `contrastAgainst` now reflect the colour a viewer actually sees, alpha composited against the layers behind it, instead of the raw declared value. A translucent background or text colour was read as opaque before this (#188)
- The page-context deltaE implementation, hand duplicated because it runs inside `page.evaluate()`, carried a rounded threshold constant that put it slightly out of step with the canonical Lab conversion (#187)
- `pagesRequested` was null for `--sitemap` without `--crawl`, instead of the actual page count (#178)
- `hasRenderedContent` no longer counts a hidden or fully collapsed element as rendered content during SPA hydration checks (#179)
- A below-fold footer logo that names its own brand in alt text or filename is recognised even without a home link, without over-matching short or hyphenated domain roots (#177, #184)
- Motion durations are read before the reduced-motion freeze is applied, instead of after (#174)
- Voice collection no longer silently drops thin pages with no way to tell why (#176)

### Changed
- Dependency updates: `@modelcontextprotocol/sdk`, `tailwindcss`, `@tailwindcss/cli`, `@google/design.md` (#185)

### If you run `--crawl`, `--sitemap`, or MCP `pages` in a CI drift gate

The robots.txt fix above can shrink a merged multi-page result by one page if the target site disallows something that was previously crawled without complaint. A page a site owner has explicitly excluded is usually not representative of the general design system anyway, so this is a one-time correction, not a regression. If a committed baseline includes such a page, the next run may report drift against it. Remedy: `dembrandt URL --compare baseline.json --approve` once, or regenerate the baseline.

The WCAG contrast fix (`--wcag`) also moves values, not just adds fields: a translucent surface that previously reported a wrong, better-looking contrast ratio now reports the real one. A CI gate keyed on `--wcag` output may see new failures that reflect an existing accessibility issue this release now measures correctly.

`release:churn` against dembrandt.com and stripe.com (single-page, no `--crawl`) shows no churn past threshold from either fix.

## [0.30.0] - 2026-08-26

### Fixed
- An extraction that finds no browser binary installs the matching one and carries on, instead of failing with `browser engine not available` and naming a second command to run. Since 0.27.1 pinned `playwright-core` to an exact version, the documented `npx playwright-core install chromium` installed whatever revision the registry served, which the pinned driver could not find; before the pin the range floated to the same version and the two matched by accident. `dembrandt install-browser` still exists for anyone who would rather pay the download up front

## [0.29.0] - 2026-08-25

### Added
- MCP extraction tools take `pages`, `paths` and `sitemap`, crawling and merging several pages over the same path as the CLI. `sitemap` alone takes up to 20 pages; `pages` caps it. A page that fails to load is dropped and the merge carries the rest (#172)
- MCP extraction tools take `noSandbox` (also `DEMBRANDT_NO_SANDBOX`) for Docker and CI containers, plus `header` and `userAgent`. A launch failure names `noSandbox` as the remedy (#172)
- `compute_drift`, `get_findings`, `export_dtcg`, `generate_design_md` and `render_report` accept the `job_id` of a completed extraction in place of an inline one. They previously took the whole extraction as a tool argument, so an agent had to resend a result it had just received, which is prohibitive at real extraction sizes. An inline extraction still wins when both are given (#172)

- npm tarballs are published from CI with provenance, via npm trusted publishing (OIDC). The release workflow's publish guard now separates "already published" from a registry error and fails closed on the latter, instead of skipping the publish and reporting success (#167)

### Changed
- `--key` sync exits 3 (`SYNC_FAILED`) when the snapshot did not reach the cloud, instead of printing a warning and exiting 0. A run that was asked to record drift and did not is a failed run, and in CI the old warning scrolled past in a log nobody reads while the build stayed green. Drift (exit 1) still takes precedence, and the messages name the remedy: a size overrun suggests a page count derived from the measured payload, a 401 points at the key page (#169)
- The cloud sync payload limit is the API's to enforce. The CLI sent its own copy of the cap, so raising the server limit still needed a CLI release and lowering it produced a rejected payload the CLI could have explained up front. A 413 now carries the same page-count advice, derived from the run (#170)

### Fixed
- MCP: two concurrent extractions restored each other's console handlers, so the second job's output could land in the JSON-RPC stream. Console is silenced once per process instead (#172)
- MCP: `meta.dembrandtVersion` and the DTCG `toolVersion` were null on every extraction, because the server never passed the tool version to the extractor (#172)
- MCP: the job cleanup interval kept the event loop alive, so the process outlived its transport by minutes (#172)
- `BrandingResult._discoveredLinks` is typed `string[]`. `discoverLinks` has always returned href strings, which the crawl path feeds straight to `new URL()` (#172)
- Drift compares `colors.semantic` role by role. The engine read that map only to attach role labels to palette entries, so a changed brand primary produced no drift at all: a rebrand that promotes a colour the page already used leaves the palette set identical and reported stable (DEM-208). Changes now appear as `semantic.<role>`, and `docs/FLAGS.md` no longer describes `--ai` primary drift the engine could not see

### Changed
- Output contract at schema 1.8.0. No shape change; colour scores rise wherever a semantic role moved, so a baseline whose primary differs from the candidate's starts reporting it on upgrade. Measured churn on upgrade is 0 for dembrandt.com and stripe.com (threshold 10), because an unchanged role contributes neither penalty nor weight. One case does move without any role moving: semantic colours authored in oklch/lch previously attached no role to their palette entry at all, and now do, so those entries carry their ROLE_WEIGHT and the same palette shift scores higher than it used to. Sites that author colours in hex or rgb, which is both reference sites, are unaffected. If an existing baseline does flip your gate red, the role really did change: read it in the report and re-approve once with `--compare <baseline> --approve`

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
