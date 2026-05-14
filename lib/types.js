/**
 * @typedef {'high'|'medium'|'low'} Confidence
 */

/**
 * @typedef {Object} PaletteColor
 * @property {string} color - Original color string
 * @property {string} normalized - Hex color (#rrggbb)
 * @property {number} count - Number of occurrences
 * @property {number} score - Semantic relevance score
 * @property {string[]} sources - CSS class/id sources
 * @property {Confidence} confidence
 */

/**
 * @typedef {Object} Colors
 * @property {PaletteColor[]} palette
 * @property {Record<string, string>} semantic - e.g. { primary: '#hex' }
 * @property {Record<string, string>} cssVariables - CSS custom properties
 * @property {PaletteColor[]} [rawColors]
 */

/**
 * @typedef {Object} TypographyStyle
 * @property {string} context - 'heading-1'|'body'|'button'|'caption'|'display'|'link'
 * @property {string} family
 * @property {string[]} fallbacks
 * @property {string} size
 * @property {string} weight
 * @property {string} lineHeight
 * @property {string} [letterSpacing]
 * @property {string} [textTransform]
 * @property {boolean} [isVariable]
 * @property {boolean} [isFluid]
 */

/**
 * @typedef {Object} Typography
 * @property {TypographyStyle[]} styles
 * @property {{ googleFonts: string[], adobeFonts: string[], variableFonts: string[] }} sources
 */

/**
 * @typedef {Object} SpacingValue
 * @property {number} px
 * @property {string} rem
 * @property {number} count
 */

/**
 * @typedef {Object} Spacing
 * @property {string} scaleType - 'base-4'|'base-8'|'fibonacci'|'custom'
 * @property {SpacingValue[]} commonValues
 */

/**
 * @typedef {Object} TokenValue
 * @property {string} value
 * @property {number} count
 * @property {Confidence} confidence
 */

/**
 * @typedef {Object} BorderRadius
 * @property {TokenValue[]} values
 */

/**
 * @typedef {Object} Borders
 * @property {TokenValue[]} widths
 * @property {TokenValue[]} styles
 * @property {TokenValue[]} colors
 * @property {{ width: string, style: string, color: string }[]} [combinations]
 */

/**
 * @typedef {Object} Shadow
 * @property {string} shadow
 * @property {number} count
 * @property {Confidence} confidence
 */

/**
 * @typedef {Object} Gradient
 * @property {string} gradient
 * @property {'linear'|'radial'|'conic'|'linear-repeating'|'radial-repeating'|'conic-repeating'} type
 * @property {string[]} stopColors
 * @property {number} count
 */

/**
 * @typedef {Object} ButtonStyle
 * @property {string} backgroundColor
 * @property {string} color
 * @property {string} padding
 * @property {string} borderRadius
 * @property {string} border
 * @property {string} [boxShadow]
 * @property {Confidence} confidence
 */

/**
 * @typedef {Object} InputStyle
 * @property {string} type
 * @property {string} border
 * @property {string} borderRadius
 * @property {string} padding
 * @property {Object} [focusStyles]
 */

/**
 * @typedef {Object} LinkStyle
 * @property {string} color
 * @property {string} textDecoration
 * @property {string} [hoverColor]
 */

/**
 * @typedef {Object} BadgeStyle
 * @property {string} backgroundColor
 * @property {string} color
 * @property {string} borderRadius
 * @property {string} padding
 */

/**
 * @typedef {Object} Components
 * @property {ButtonStyle[]} buttons
 * @property {{ text: InputStyle[] }} inputs
 * @property {LinkStyle[]} links
 * @property {BadgeStyle[]} badges
 */

/**
 * @typedef {Object} Breakpoint
 * @property {number} px
 */

/**
 * @typedef {Object} IconSystem
 * @property {string} name
 * @property {string} type
 * @property {string[]} [sizes]
 */

/**
 * @typedef {Object} Framework
 * @property {string} name
 * @property {Confidence} confidence
 * @property {string} evidence
 */

/**
 * @typedef {Object} Logo
 * @property {'img'|'svg'} source
 * @property {string} url
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [alt]
 * @property {{ top: number, right: number, bottom: number, left: number }} safeZone
 * @property {string|null} background
 */

/**
 * @typedef {Object} Favicon
 * @property {string} type
 * @property {string} url
 * @property {string|null} sizes
 */

/**
 * @typedef {Object} WcagPair
 * @property {string} fg - Foreground hex color
 * @property {string} bg - Background hex color
 * @property {number} ratio - Contrast ratio (e.g. 4.5)
 * @property {boolean} aa - Passes WCAG AA (4.5:1)
 * @property {boolean} aaLarge - Passes WCAG AA Large (3:1)
 * @property {boolean} aaa - Passes WCAG AAA (7:1)
 * @property {number} count - How many elements share this pair
 */

/**
 * @typedef {Object} BrandingResult
 * @property {string} url
 * @property {string} extractedAt - ISO 8601 timestamp
 * @property {string|null} siteName
 * @property {Logo|null} logo
 * @property {Favicon[]} favicons
 * @property {Colors} colors
 * @property {Typography} typography
 * @property {Spacing} spacing
 * @property {BorderRadius} borderRadius
 * @property {Borders} borders
 * @property {Shadow[]} shadows
 * @property {Gradient[]} gradients
 * @property {Components} components
 * @property {Breakpoint[]} breakpoints
 * @property {IconSystem[]} iconSystem
 * @property {Framework[]} frameworks
 * @property {WcagPair[]} [wcag]
 * @property {{ url: string }[]} [pages]
 */

export {};
