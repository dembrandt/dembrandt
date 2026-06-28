# Extraction recall: brand colours dembrandt fails to extract

## Context

`dembrandt-ml` holds human-labeled brand colours for ~100 sites. A set of them
(40 colours across 26 sites in the curated `extraction-misses.jsonl`) never
appear in dembrandt's extracted palette, so the ML picker literally cannot
select them. This is a hard recall ceiling, not a classifier problem. Fixing
extraction raises the model's maximum achievable accuracy. Extends DEM-110
(done) and DEM-111 (logo SVG fill/stroke).

Note on metric: a broader per-colour exact-match cut over all 107 labelled sites
shows ~48% of brand colours and ~33% of primaries absent from the palette, but
that figure is inflated by perceptual twins (a label can be ΔE2000 ~2 from a
palette entry and still count as "missing"). Use a ΔE-tolerant recall harness
(DEM-125) to measure real misses; the patterns below are the genuine, fully
absent cases.

## Patterns (root causes, by frequency)

### 1. Vivid accent colours that live only in inline SVG, icons, illustrations
Fills and strokes. DEM-111 added logo SVG fill/stroke. Extend it to all inline
SVG, not just logo-matched elements: read computed `fill`/`stroke` of `<svg>`
descendants as palette candidates.
- `#ff6500` axiomspace, `#7ac843` drivewealth, `#ce4dc1` color.com, `#48a1db` signifyd

### 2. Gradient stop colours not parsed
CTAs and heroes use `background-image: linear-gradient(...)`. Extract each colour
stop (pull `rgb()`/`rgba()`/`#hex` out of `background-image`) as candidates.
- Brand blues and oranges that resolve to nearest `#ffffff` today.

### 3. Light brand tints and pastels collapsed to white or filtered out
Chromatic-but-light brand colours (pastel section backgrounds, soft badges) get
merged into `#ffffff` or dropped by a near-white filter. Keep a light colour as a
candidate when it has real chroma (OKLab/HSL saturation above a small threshold)
even if lightness is high. Do not snap it to white.
- `#b9f4d8` flatpay, `#ffc8d0` pleo, `#cad5e2` kindbody, `#8fe3e8` neo4j, `#a5d6a7` mobilecoin, `#fddf74` mobilecoin

### 4. Pure / near-black brand colours auto-dropped
`#000000` is filtered as "canvas", but for some brands black is the mark (logo or
wordmark). Allow near-black as a candidate when it appears on a logo/brand
element rather than blanket-dropping it.
- `#000000` drivewealth, flatpay, sysdig

### 5. Low-usage vivid accents below count/area thresholds
Small but high-saturation accents (badges, icon fills, a single CTA) fall under
the minimum usage/area gate. Lower the threshold for high-chroma colours so a
small vivid brand accent survives even with low pixel count.
- `#fdb138`, `#367ddb`, `#369f93` color.com (4 misses on one site)

## Where

`lib/extractors/colors.ts`, the candidate-collection and filtering stage (before
semantic selection). Changes are additive (more candidates), so verify they do
not flood the palette: gate tints, blacks and low-usage colours by chroma and
provenance (SVG/logo/CTA element), not by raw count.

## Verification

Re-run extraction on these; the wanted hex should now appear as a candidate.

| Site | Wanted hex | Note |
| --- | --- | --- |
| axiomspace.com | `#ff6500` | SVG/CTA |
| drivewealth.com | `#7ac843`, `#000000` | SVG/accent, logo |
| color.com | `#fdb138` `#367ddb` `#369f93` `#ce4dc1` | multi accents |
| signifyd.com | `#48a1db` `#582c83` `#0070bd` `#a438a8` | |
| flatpay.com | `#b9f4d8`, `#000000` | light tint, logo |
| pleo.io | `#ffc8d0` | light tint |
| kindbody.com | `#cad5e2` | light tint |
| neo4j.com | `#8fe3e8` | light tint |
| mobilecoin.com | `#fddf74` `#a5d6a7` | |
| matrixport.com | `#0040ff` | vivid accent |
| betterfly.com | `#00778f` `#b65200` `#bf1dba` | |

Full list: `dembrandt-ml/data/extraction-misses.jsonl`.

## Success metric

Re-build the ml dataset after the fix (`npm run dataset` in `dembrandt-ml`) and
confirm the miss count drops from 40 and `nSites` in training rises (fewer sites
excluded as all-miss). Gate the change on the ΔE-tolerant recall harness
(DEM-125) so precision (palette not flooded) is verified alongside recall.

## Related work already on this branch

`fix/color-recall-precision` has begun the structural side of this:
- Card/section/input/badge colours recovered from the structural-noise drop, with
  a saturation gate so saturated high-usage brand fills are kept (pattern 5,
  partial).
- `badge` removed from the status context (brand badges are real brand colour).
- Ancestor-context lift for deeply-nested content (median labelled xpath depth ~10).
- Footer added to the context vocabulary.
- Carousel reveal (Swiper/Slick/Splide/etc) so off-screen slide colours mount.

Patterns 1 (all-SVG fill/stroke), 2 (gradient stops), 3 (light tints), and 4
(near-black on brand element) remain open and are the highest-value next steps.
