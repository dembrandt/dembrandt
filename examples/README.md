# Dembrandt Examples

This folder contains sample extractions against public open-source design system documentation sites. Each JSON file demonstrates Dembrandt's ability to extract colors, typography, spacing, shadows, and component styles.

The two included samples target publicly documented, open-source design systems whose authors publish their design guidance for others to read and learn from.

## Examples

### 1. [material.io.json](material.io.json) - Material Design (open-source design system)

Sample extraction against the public Material Design documentation site.

**Observed in this extraction:**
- Color palette with ~15 unique colors
- Sans-serif typography stack with display, headline, and body scales
- 8px base spacing grid
- Rounded border radius values (4px, 16px, 24px)
- Multiple button variants (filled, container, text)
- CSS variables for theming
- Six responsive breakpoints

### 2. [carbon.design.json](carbon.design.json) - Carbon Design System (open-source design system)

Sample extraction against the public Carbon Design System documentation site.

**Observed in this extraction:**
- Enterprise-oriented neutral color palette (~10 unique colors)
- Monospaced and sans typography pairing
- Conservative 8px spacing scale
- Minimal button variants
- High-contrast accessible combinations

---

## How These Were Generated

Each example was generated with a single command:

```bash
npx dembrandt <url> --json-only > examples/<name>.json
```

**Key capabilities demonstrated:**
- Automatic redirect handling
- SPA hydration detection (8-second wait for JavaScript-heavy sites)
- Component analysis (buttons, inputs, etc.)
- Framework detection
- Logo extraction
- Responsive breakpoint discovery
- CSS variable extraction

---

## What You Can Do With These

**For designers:**
- Import design tokens into your own tooling
- Build design system documentation for your own projects
- Learn how published design systems structure their CSS

**For developers:**
- Generate Tailwind configs from extracted tokens
- Audit design consistency across your own sites
- Study spacing and type scales

**For product teams:**
- Document your own design system
- Compare internal implementations against your guidelines

---

## Try It Yourself

```bash
# Extract any site you own or have permission to analyze
npx dembrandt example.com

# Export as JSON
npx dembrandt example.com --json-only > tokens.json
```

---

These examples showcase how Dembrandt reads publicly published CSS from design system documentation sites and turns it into structured tokens.
