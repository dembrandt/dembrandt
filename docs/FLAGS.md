# Flag compatibility

Default rule: every flag combines freely with every other flag. Extraction modifiers (`--dark-mode`, `--mobile`, `--slow`, `--stealth`, fingerprint flags) change what is extracted; export flags (`--save-output`, `--dtcg`, `--brand-guide`, `--design-md`, `--html`, `--screenshot`) each write their own artifact from the same result; analysis flags (`--wcag`, `--compare`, `--ai`) run on top. Stack as many as you want.

The tables below list the only exceptions: combinations that change each other's behavior, combinations that are ignored, and flags that do not propagate to multi-page runs.

## Combinations that change behavior

| Combination | Behavior |
|---|---|
| `--compare` + `--approve` | Local baseline file: the current extraction overwrites the baseline and the run passes regardless of drift. App baseline id: `--approve` is ignored and drift still exits 1. |
| `--compare` + `--html` | The drift report is embedded in the HTML report. |
| `--compare` + `--json-only` | A `drift` object is attached to the stdout JSON. Saved files (`--save-output`, baselines) stay pure extractions. |
| `--crawl` + `--sitemap` | Sitemap discovery is used, `--crawl N` sets the page limit (N pages total). `--sitemap` alone discovers up to 20 additional pages. |
| `--dtcg` + `--save-output` | Two files: the raw extraction (`.json`, from `--save-output`) and the DTCG tokens (`.tokens.json`, from `--dtcg`), same timestamp. Each flag alone writes only its own file. |
| `--json-only` + `--dtcg` | stdout is the DTCG document. `--wcag`, `--raw-colors`, and `pages` data exist only in the raw extraction: drop `--dtcg` or add `--save-output` to get them. |
| `--json-only` + any export flag | Exports still write. All status output moves to stderr so stdout stays parseable JSON. |
| `--ai` + `--compare` | ML overwrites `colors.semantic.primary` before the compare runs. Comparing an `--ai` run against a non-`--ai` baseline (or vice versa) can report false primary-color drift. Use the same flag on both sides. |
| `--key` + `--crawl` / `--sitemap` / extra paths | Merged multi-page results can exceed the 150 KB sync cap; the upload is then skipped with a warning. |

## Combinations that are ignored or fail

| Combination | Behavior |
|---|---|
| `--approve` without `--compare` | No effect. A warning is printed. |
| Explicit `[paths...]` arguments + `--crawl` or `--sitemap` | Explicit paths win; link and sitemap discovery are skipped entirely. |
| `--no-sandbox` + `--browser firefox` | Ignored. Sandbox flags are Chromium-only. |
| `BROWSER_CDP_ENDPOINT` (env) + `--browser firefox` | Error. CDP connect is Chromium-only. CDP mode also disables the visible-browser retry on navigation failure. |

## Multi-page runs: which flags reach every page

In a multi-page run (`--crawl`, `--sitemap`, or extra `[paths...]`), some flags apply to every extracted page and some apply only to the first page.

| Applied to every page | First page only |
|---|---|
| `--dark-mode` | `--screenshot` |
| `--mobile` | |
| `--slow` | |
| `--stealth` | |
| `--cookie` | |
| `--header` | |
| `--user-agent` | |
| `--locale` | |
| `--timezone` | |
| `--accept-language` | |
| `--screen-size` | |
| `--wcag` | |
| `--raw-colors` | |

`--wcag` results are merged across pages: static pairs are deduped order-insensitively by color pair with counts summed (top 50 kept), interactive state pairs appended after. `--raw-colors` stays per page by design, since it is a diagnostic view of the pre-filter color pipeline that runs before merge: each page's raw colors sit on its entry in the `pages` array, and `colors.rawColors` remains the first page's set for backward compatibility.
