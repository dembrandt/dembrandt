import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'output/**', 'test/golden/**', 'test/gold/**', 'test/scores/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript already resolves identifiers against Node + DOM libs; eslint's
      // no-undef double-checks against a globals list it doesn't have and only
      // produces false positives (process, console, document, ...). Off for TS.
      'no-undef': 'off',
      // `any` is slop everywhere except the page.evaluate / DOM boundary and the
      // ingest canonicalization layer. It is an ERROR by default so no new file
      // can introduce one; the pre-existing offenders are listed in the ratchet
      // block below. That list may shrink, never grow.
      '@typescript-eslint/no-explicit-any': 'error',
      // tsc's noUnusedLocals/noUnusedParameters already covers this with `_` opt-out.
      '@typescript-eslint/no-unused-vars': 'off',
      // try{}catch{} that intentionally swallow (best-effort extraction) are idiomatic here.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // anti-bot init scripts and color parsing legitimately use control/escape regex.
      'no-control-regex': 'off',
      // false-positives on defensive `let x = []` before a try, and on trailing
      // counter increments — both idiomatic here. Not worth the noise.
      'no-useless-assignment': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // `any` ratchet. These files predate the rule being an error. Clearing a file
  // means deleting its line here; adding a line is not allowed. `npm run lint`
  // runs with --max-warnings 0, so this list is the only place `any` survives.
  // Remaining: 237 occurrences across 23 files.
  // ---------------------------------------------------------------------------
  {
    files: [
      'lib/extractors/logo.ts',
      'lib/formatters/markdown.ts',
      'lib/extractors/breakpoints.ts',
      'mcp-server.ts',
      'test/logo-heuristics.test.ts',
      'lib/formatters/dtcg.ts',
      'lib/formatters/terminal.ts',
      'lib/extractors/index.ts',
      'lib/extractors/components.ts',
      'lib/formatters/brand-guide.ts',
      'index.ts',
      'test/compare.test.ts',
      'lib/dtcg/validate.ts',
      'test/ml.test.ts',
      'lib/extractors/typography.ts',
      'lib/merger.ts',
      'test/normalize.test.ts',
      'lib/extractors/teach.ts',
      'test/consent.test.ts',
      'test/_vitest-shim.ts',
      'test/drift.test.ts',
      'test/findings.test.ts',
      'test/html.test.ts',
    ],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
