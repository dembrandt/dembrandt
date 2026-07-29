# Font source URLs in typography extraction

## Problem

`typography.sources` currently records font *names* (`googleFonts: string[]`,
`adobeFonts`) but never the actual URLs the browser loaded fonts from. Callers
that want to re-fetch, cache, or verify font assets have nothing to go on,
unlike logos/favicons which already carry resolved URLs.

## Design

### `lib/extractors/typography.ts`

- Export a new pure function:

  ```ts
  export function filterFontUrls(urls: string[]): string[]
  ```

  Input: raw, already-absolute candidate URL strings collected in the browser.
  Behavior:
  - Drop `data:` URIs.
  - Keep only URLs that either end in a font file extension
    (`.woff`, `.woff2`, `.ttf`, `.otf`, `.eot`, allowing a trailing `?`/`#`
    query/fragment) OR match a known webfont provider host
    (`fonts.googleapis.com`, `fonts.gstatic.com`, `use.typekit.net`,
    `fonts.bunny.net`).
  - Dedupe.
  - Return sorted array (stable output for tests/diffing).
  - No browser APIs used — unit-testable directly, same convention as
    `parseVariableAxes` / `parseOpenTypeFeatures`.

- Inside the existing `page.evaluate()` block, collect **unfiltered** absolute
  candidate URLs into a new `fontUrlCandidates: string[]` array on the
  returned data object, from three sources:
  1. `link[rel*="stylesheet"]` elements whose `href` matches the provider
     hosts above.
  2. `link[rel*="preload"][as="font"]` elements' `href`.
  3. `@font-face` `src` declarations, parsed via `url(...)` regex, from the
     existing `document.styleSheets` walk already used for `customFonts` /
     `fontDisplay` detection (extend that loop rather than adding a second
     traversal).
  - All resolved via `new URL(href, location.href).href`.
  - Filtering/dedup happens in Node afterward via `filterFontUrls`, not in the
    browser.

- After `page.evaluate()` returns, in Node:
  ```ts
  sources.urls = filterFontUrls(data.fontUrlCandidates);
  ```
  Always an array; `[]` when nothing found (never `undefined`), matching the
  existing convention for `styles` and other array fields.

### `lib/types.ts`

Add to `Typography['sources']`:
```ts
/** Resolved font asset/stylesheet URLs discovered during extraction. */
urls?: string[];
```

### `lib/merger.ts`, `lib/normalize.ts`

No changes. `urls` is a plain `string[]` under `sources`; the existing
generic array-union merge (`sources[k] = [...new Set([...sources[k], ...v])]`)
already handles it correctly across crawled pages. `normalizeExtraction`
requires no coercion for a plain string array.

### Formatters

- **`lib/formatters/terminal.ts`** (`displayTypography`): after the existing
  "Fonts: ..." line, if `typography.sources.urls?.length`, print each URL as
  a clickable line using the existing `terminalLink()` OSC-8 helper (same
  pattern used for favicons), truncated with a "+N more" line past the first
  few entries — consistent with how the existing font-name list truncates.
- **`lib/formatters/html.ts`** (`typographySection`): append a short "Font
  files" list of `<a>` links below the existing `srcLine`, using the file's
  existing `esc()` helper.
- **`lib/formatters/markdown.ts`** (`buildTypographySection`): add a
  `- **Font URLs**: ...` bullet (or nested list) next to the existing
  "Font source" bullet, only rendered when non-empty.
- **`lib/formatters/brand-guide.ts`, `lib/formatters/dtcg.ts`**: intentionally
  untouched. Brand-guide is a print/visual artifact with no raw-URL
  precedent; DTCG typography tokens model design values (family/size/weight),
  not asset provenance.

### Tests (`test/typography.test.ts`)

Add unit tests for `filterFontUrls` covering:
- Dedupes repeated URLs.
- Drops `data:` URIs.
- Keeps `.woff2` / `.woff` / `.ttf` / `.otf` / `.eot` URLs (with and without
  query strings).
- Keeps Google Fonts / Typekit / Bunny Fonts stylesheet URLs even without a
  font-file extension.
- Drops unrelated URLs (e.g. a plain image, analytics script).
- Returns `[]` for empty input.

### Backward compatibility

`sources.urls` is always emitted as `[]` when empty. Existing consumers that
don't know about the field are unaffected; anything that spreads
`typography.sources` picks it up automatically.

### Release note

"Typography extraction now includes discovered font source URLs
(stylesheets, preload hints, and @font-face assets)."
