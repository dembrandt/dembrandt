import chalk from 'chalk';

/**
 * Terminal theme: semantic colors and canonical status icons.
 *
 * Colors use the ANSI 16-color palette (chalk named colors) instead of fixed
 * truecolor hexes. Named colors are remapped by the user's terminal theme, so
 * they stay legible on both light and dark backgrounds. Fixed pastels (the old
 * Dracula hexes) wash out on light terminals.
 *
 * Each entry is a chalk function: color.success('done').
 */
export const color = {
  success: chalk.green,    // completed steps, high confidence
  warning: chalk.yellow,   // recoverable issues, medium confidence
  error: chalk.red,        // failures
  info: chalk.cyan,        // links, file paths, context labels
  accent: chalk.magenta,   // summary line, special highlights
  heading: chalk.bold,     // section titles
  muted: chalk.gray,       // low confidence, secondary text
  faint: chalk.dim,        // tree lines, metadata
};

/**
 * Canonical status icons. All single display-column on every terminal: the
 * light check/x (U+2713/U+2717) and ASCII '!'/'i' avoid the emoji-presentation
 * width-2 rendering that the heavy variants (✔ ✘) and circled glyphs (ⓘ) get
 * in many terminals, which would skew left-edge alignment. Status markers in
 * the output use these exact glyphs.
 */
export const icon = {
  success: '✓',
  warning: '!',
  error: '✗',
  info: 'i',
  arrow: '→',
  bullet: '●',
};
