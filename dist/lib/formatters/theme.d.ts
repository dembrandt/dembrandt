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
export declare const color: {
    success: import("chalk").ChalkInstance;
    warning: import("chalk").ChalkInstance;
    error: import("chalk").ChalkInstance;
    info: import("chalk").ChalkInstance;
    accent: import("chalk").ChalkInstance;
    heading: import("chalk").ChalkInstance;
    muted: import("chalk").ChalkInstance;
    faint: import("chalk").ChalkInstance;
};
/**
 * Canonical status icons. All single display-column on every terminal: the
 * light check/x (U+2713/U+2717) and ASCII '!'/'i' avoid the emoji-presentation
 * width-2 rendering that the heavy variants (✔ ✘) and circled glyphs (ⓘ) get
 * in many terminals, which would skew left-edge alignment. Status markers in
 * the output use these exact glyphs.
 */
export declare const icon: {
    success: string;
    warning: string;
    error: string;
    info: string;
    arrow: string;
    bullet: string;
};
