# dembrandt type model

Visual map of the extraction output contract, generated from `lib/types.ts` and
`lib/version.ts`. `BrandingResult` is the root every consumer (CLI, MCP,
dembrandt-next, drift) reads. Renders in VS Code (Mermaid preview) and GitHub.

```mermaid
classDiagram
  class BrandingResult {
    +string url
    +string extractedAt
    +ExtractionMeta meta
    +Logo logo
    +Colors colors
    +Typography typography
    +Spacing spacing
    +BorderRadius borderRadius
    +Borders borders
    +Shadow[] shadows
    +Gradient[] gradients
    +Components components
    +Breakpoint[] breakpoints
    +IconSystem[] iconSystem
    +Framework[] frameworks
    +Favicon[] favicons
    +WcagPair[] wcag
    +note isCanvasOnly pages
  }

  class ExtractionMeta {
    +string dembrandtVersion
    +string schemaVersion
    +Record flags
    +string[] degraded
  }
  class Colors {
    +PaletteColor[] palette
    +Record~string,string~ semantic
    +Record~string,string~ cssVariables
  }
  class PaletteColor {
    +string color
    +string normalized
    +number count
    +Confidence confidence
  }
  class Typography {
    +TypographyStyle[] styles
    +sources
  }
  class TypographyStyle {
    +string context
    +string family
    +string size
    +weight string or number
    +string lineHeight
    +string letterSpacing
  }
  class Spacing {
    +string scaleType
    +SpacingValue[] commonValues
  }
  class SpacingValue {
    +number px
    +string rem
  }
  class BorderRadius {
    +TokenValue[] values
  }
  class Borders {
    +TokenValue[] widths
    +TokenValue[] colors
    +BorderCombination[] combinations
  }
  class TokenValue {
    +string value
    +number count
    +Confidence confidence
  }
  class Shadow {
    +string shadow
    +Confidence confidence
  }
  class Gradient {
    +string gradient
    +string type
    +string[] stopColors
  }
  class Components {
    +any[] buttons
    +inputs links badges
  }
  class Logo {
    +string source
    +string url
    +bool inline
    +string color
    +string dataUri
  }
  class WcagPair {
    +string fg
    +string bg
    +number ratio
    +bool aa
  }

  BrandingResult *-- ExtractionMeta
  BrandingResult *-- Colors
  BrandingResult *-- Typography
  BrandingResult *-- Spacing
  BrandingResult *-- BorderRadius
  BrandingResult *-- Borders
  BrandingResult *-- "many" Shadow
  BrandingResult *-- "many" Gradient
  BrandingResult *-- Components
  BrandingResult *-- Logo
  BrandingResult *-- "many" WcagPair
  Colors *-- "many" PaletteColor
  Typography *-- "many" TypographyStyle
  Spacing *-- "many" SpacingValue
  BorderRadius *-- "many" TokenValue
  Borders *-- "many" TokenValue
```

## Version contract (`lib/version.ts`)

Separate from the data shape: three independent version axes plus the DTCG
`$extensions` provenance block.

```mermaid
classDiagram
  class DembrandtProvenance {
    +string schemaVersion
    +string toolVersion
    +string specVersion
    +generator dembrandt
    +source urlAndDomain
    +string extractedAt
  }
  class ExtractOptions {
    +bool slow darkMode mobile stealth wcag
    +number navigationTimeout
    +string locale timezoneId userAgent
    +string _version
  }
  note for DembrandtProvenance "Emitted under the com.dembrandt extensions key in --dtcg output, via buildDembrandtProvenance"
```
