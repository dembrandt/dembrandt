/**
 * Color Conversion Utilities
 *
 * Converts colors between RGB, LCH, and OKLCH color spaces.
 */
/**
 * Convert RGB to LCH
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {{ l: number, c: number, h: number }}
 */
export declare function rgbToLch(r: any, g: any, b: any): {
    l: any;
    c: number;
    h: number;
};
/**
 * Convert RGB to OKLCH
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {{ l: number, c: number, h: number }}
 */
export declare function rgbToOklch(r: any, g: any, b: any): {
    l: any;
    c: number;
    h: number;
};
/**
 * Format LCH values as CSS lch() string
 * @param {{ l: number, c: number, h: number }} lch
 * @param {number} [alpha] - Optional alpha value (0-1)
 * @returns {string}
 */
export declare function formatLch(lch: any, alpha: any): string;
/**
 * Format OKLCH values as CSS oklch() string
 * @param {{ l: number, c: number, h: number }} oklch
 * @param {number} [alpha] - Optional alpha value (0-1)
 * @returns {string}
 */
export declare function formatOklch(oklch: any, alpha: any): string;
/**
 * Compute CIE76 delta-E perceptual distance between two hex colors.
 * Returns 0 for identical colors, ~100 for maximally different.
 * @param {string} hex1 - Hex color string (e.g. "#ff0000")
 * @param {string} hex2 - Hex color string
 * @returns {number}
 */
export declare function deltaE(hex1: any, hex2: any): number;
/**
 * Perceptual color distance using CIEDE2000 — the accurate successor to the
 * CIE76 Euclidean distance in deltaE(). Accepts hex or rgb()/rgba() strings.
 * Returns 0 for identical inputs and 100 when either color cannot be parsed.
 * A just-noticeable difference is ~2.3.
 * @param {string} c1
 * @param {string} c2
 * @returns {number}
 */
export declare function deltaE2000(c1: any, c2: any): number;
/**
 * Parse a hex color string and return RGB values
 * @param {string} hex - Hex color (#fff, #ffffff, #ffffffaa)
 * @returns {{ r: number, g: number, b: number, a?: number } | null}
 */
export declare function hexToRgb(hex: any): {
    r: number;
    g: number;
    b: number;
    a?: undefined;
} | {
    r: number;
    g: number;
    b: number;
    a: number;
};
/**
 * Compute WCAG 2.1 relative luminance for a hex color.
 * @param {string} hex
 * @returns {number|null}
 */
export declare function relativeLuminance(hex: any): number;
/**
 * Compute WCAG contrast ratios for all pairs in a color palette.
 * @param {Array<{color: string, normalized: string, confidence: string}>} palette
 * @returns {Array<{fg: string, bg: string, ratio: number, aa: boolean, aaLarge: boolean, aaa: boolean}>}
 */
export declare function computeWcag(palette: any): any[];
/**
 * Convert any supported color format to all formats
 * @param {string} colorString - Color in hex, rgb(), or rgba() format
 * @returns {{ hex: string, rgb: string, lch: string, oklch: string, hasAlpha: boolean } | null}
 */
export declare function convertColor(colorString: any): {
    hex: string;
    rgb: string;
    lch: string;
    oklch: string;
    hasAlpha: boolean;
};
