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
      // `any` is used deliberately at the page.evaluate / DOM boundary and in the
      // ported validator's JSON traversal; tsc + noUnusedLocals already gate the rest.
      '@typescript-eslint/no-explicit-any': 'off',
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
);
