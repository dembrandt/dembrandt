<!-- Title: conventional commit style — feat(scope): …, fix(scope): …, chore: … -->

## What

<!-- What changes and why. One paragraph. Link the ticket: Closes DEM-XXX -->

## How

<!-- Decisions a reviewer needs: approach, tradeoffs, rejected alternatives.
     Delete if the diff speaks for itself. -->

## Test plan

<!-- How this was verified: `npm test`, a real CLI run against a live site,
     qa:diff, or the CI smoke — name the concrete command, not "tested". -->

## Checklist

- [ ] `npm run lint` and `npm test` pass locally
- [ ] New/changed flags: orthogonal, propagate to multi-page runs, documented in README and `docs/FLAGS.md`
- [ ] CLI contract intact: exit-code taxonomy and clean `--json-only` stdout (status output to stderr)
- [ ] User-facing behavior change → README updated
