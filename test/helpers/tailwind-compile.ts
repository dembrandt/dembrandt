import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

/**
 * Runs the real Tailwind compiler over an emitted theme. Shared by the
 * emitter's compile tests and the real-extraction fixture tests, because
 * "Tailwind accepts this" is the one claim neither can make on its own.
 */

const require = createRequire(import.meta.url);
// The package exports only its package.json, so resolve the bin off that.
const cliPkg = require.resolve('@tailwindcss/cli/package.json');
const cli = join(dirname(cliPkg), JSON.parse(readFileSync(cliPkg, 'utf8')).bin.tailwindcss);

// `@import "tailwindcss"` resolves like a node import, relative to the CSS
// file, so the scratch project has to sit where it can see node_modules. The
// OS temp dir cannot.
const repoRoot = join(dirname(require.resolve('tailwindcss/package.json')), '..', '..');

export function compile(themeCss: string, classes: readonly string[]): string {
  const dir = mkdtempSync(join(repoRoot, '.tailwind-compile-'));
  try {
    writeFileSync(join(dir, 'page.html'), `<div class="${classes.join(' ')}"></div>`);
    writeFileSync(join(dir, 'theme.css'), `${themeCss}\n@source "./page.html";\n`);
    try {
      execFileSync(process.execPath, [cli, '-i', join(dir, 'theme.css'), '-o', join(dir, 'out.css')], {
        cwd: dir,
        stdio: 'pipe',
      });
    } catch (err) {
      // execFileSync's own message is the command line, which hides the CSS
      // error that is the whole point of this test.
      const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? '';
      throw new Error(`Tailwind rejected the emitted theme:\n${stderr}`, { cause: err });
    }
    return readFileSync(join(dir, 'out.css'), 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

