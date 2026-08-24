# Continuous integration

Extract a live URL, compare it against a baseline, fail the job when the design drifted.

- Full reference workflow: [`examples/drift-gate.yml`](../examples/drift-gate.yml)
- Flag compatibility tables: [FLAGS.md](FLAGS.md)
- Browser install and engine selection: [usage.md](usage.md#browser-selection)
- API keys for cloud snapshot sync: [dembrandt.com/app/api-keys](https://www.dembrandt.com/app/api-keys)

## GitHub Action

The official action wraps extract → compare → gate into one step: it installs a matching Chromium, runs a pinned CLI version, fails the job on drift, and renders the drifted tokens as inline annotations on the PR. This is the supported path; the sections below are for runners it does not cover.

```yaml
- uses: dembrandt/dembrandt@v0.28.0
  with:
    url: https://preview.example.com
    baseline: .dembrandt/baseline.json
```

Gating a Vercel preview needs no extra wiring: trigger on the deployment event and pass its URL:

```yaml
on:
  deployment_status:

jobs:
  drift:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dembrandt/dembrandt@v0.28.0
        with:
          url: ${{ github.event.deployment_status.environment_url }}
          baseline: .dembrandt/baseline.json
          key: ${{ secrets.DEMBRANDT_KEY }}
```

| Input | Required | Description |
|---|---|---|
| `url` | yes | URL to extract, typically the PR's preview deployment |
| `baseline` | no | Committed baseline JSON path, or an App baseline id. Omit to extract without gating |
| `key` | no | API key for cloud snapshot sync ([dembrandt.com/app/api-keys](https://www.dembrandt.com/app/api-keys)) |
| `args` | no | Extra CLI flags, e.g. `--wcag` or `--crawl 3` |

Outputs: `report` (path to the drift/extraction JSON) and `score` (drift score, empty without a baseline). The action pins the CLI version per release, so a version-tagged gate never changes behavior under you. For a fully hand-rolled workflow (per-page PR comment, preview vs production, report artifact), see [`examples/drift-gate.yml`](../examples/drift-gate.yml).

## Running the CLI directly

Dembrandt drives a real browser, so the browser revision must match `playwright-core`.

If you are not using the Playwright container image, install the browser revision that matches `playwright-core`:

```bash
# matches the bundled playwright-core automatically
dembrandt install-browser
# on a bare Linux runner, add the system libraries too
npx playwright@$(node -p "require('playwright-core/package.json').version") install --with-deps chromium
```

A mismatched version fails with "Executable doesn't exist". The container image avoids this entirely: just match its tag (`v1.60.0`) to the `playwright-core` version.

## Drift gate

Compare an extraction against a committed baseline and fail the job on drift:

```bash
# capture a baseline once (same environment you will check against)
dembrandt https://app.example.com --json-only > baseline.json

# in CI, exits non-zero on drift; writes a report artifact
dembrandt https://app.example.com --compare baseline.json --html report.html
```

When the change is intended, accept it as the new baseline: `--approve` overwrites the local baseline file and passes instead of failing:

```bash
dembrandt https://app.example.com --compare baseline.json --approve
```

Add `--json-only` to a `--compare` run to get the drift report as machine-readable JSON under a `drift` key: `score`, `status`, `summary`, and per-token `changes[]` (each with `category`, `kind`, `before`, `after`, `delta`). A CI gate can render exactly which tokens moved (e.g. in a PR comment) from this instead of parsing the HTML report:

```bash
dembrandt https://app.example.com --compare baseline.json --json-only
```

**Any CI.** The gate is platform-neutral: it is just the exit code plus the drift JSON, so it drops into any runner:

```bash
dembrandt "$PREVIEW/checkout" --compare base.json --json-only > drift.json
# exit 1 = drift. Read drift.json (.drift.changes) and surface it however your
# platform does: a GitLab MR note, an Azure DevOps PR thread, a Jenkins status,
# a Slack message, or an auto-filed Jira/Linear ticket.
```

A ready-to-use **GitHub Actions** workflow (preview vs production, per-page PR comment with the exact tokens that changed, run summary, report artifact, host-auth bypass) is in [`examples/drift-gate.yml`](../examples/drift-gate.yml) as one full reference. The result-surfacing step (annotations, PR comment) is the only platform-specific part; the extract → compare → branch-on-exit-code core is identical on GitLab CI, Jenkins, and Azure DevOps.

## Exit codes

A pipeline can branch on the exit code; "design drifted" and "extraction broke" are distinct:

| Code | Meaning |
|---|---|
| `0` | Success, or stable (no drift) under `--compare` |
| `1` | Drift detected (`--compare`) |
| `2` | Extraction failure (`EXTRACTION_FAILED`, `BROWSER_UNAVAILABLE`) |
| `3` | Cloud sync failed under `--key`; the extraction itself succeeded |
| `67` | Navigation/connection timeout (`NAVIGATION_TIMEOUT`), retryable, try `--slow` |

With `--json-only`, a failure also prints a machine-readable `{ "error": { "code", "message" } }` to stdout.

`3` exists so a pipeline can tell "this run was not recorded" apart from "the extractor is broken". Passing `--key` states an intent, and a run that could not meet it has not done what was asked, even though its output is valid: the payload was over the size limit, the key was rejected, or the API was unreachable. Reporting success there means drift tracking stops recording and nothing ever says so.

**Rate limiting is not a sync failure.** Exceeding the account quota (20/hour, 200/day, 500/week) still warns and exits `0`, because hitting a quota is the system working as designed rather than a fault to fix, and a snapshot job should not turn a deploy pipeline red for it. A rejected key, an oversized payload or an unreachable API are the opposite: they need someone to act, and nobody acts on what nobody sees.

Drift (`1`) takes precedence when both apply, since drift is the more actionable signal and the sync failure is printed regardless.
