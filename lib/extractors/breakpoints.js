export async function extractBreakpoints(page) {
  return await page.evaluate(() => {
    const breakpoints = new Set();

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.media) {
            const match = rule.media.mediaText.match(/(\d+)px/g);
            if (match) match.forEach((m) => breakpoints.add(parseInt(m)));
          }
        }
      } catch (e) {}
    }

    return Array.from(breakpoints)
      .sort((a, b) => a - b)
      .map((px) => ({ px: px + "px" }));
  });
}

export async function detectIconSystem(page) {
  return await page.evaluate(() => {
    const systems = [];

    if (document.querySelector('[class*="fa-"]')) {
      systems.push({ name: "Font Awesome", type: "icon-font" });
    }
    if (document.querySelector('[class*="material-icons"]')) {
      systems.push({ name: "Material Icons", type: "icon-font" });
    }
    if (document.querySelector('svg[class*="heroicon"]') || document.querySelector('svg[data-slot="icon"]')) {
      systems.push({ name: "Heroicons", type: "svg" });
    }
    if (document.querySelector('svg[class*="hugeicons"]') || document.querySelector('[class*="hugeicons-"]')) {
      systems.push({ name: "Hugeicons", type: "svg" });
    }
    if (document.querySelector('ion-icon') || document.querySelector('[class*="ionicons"]')) {
      systems.push({ name: "Ionicons", type: "svg" });
    }
    if (document.querySelector('svg[data-feather]') || document.querySelector('i[data-feather]') || document.querySelector('[class*="feather-"]')) {
      systems.push({ name: "Feather Icons", type: "svg" });
    }
    if (document.querySelector('svg[class*="icon"]')) {
      systems.push({ name: "SVG Icons", type: "svg" });
    }

    return systems;
  });
}

export async function detectFrameworks(page) {
  return await page.evaluate(() => {
    const frameworks = [];
    const html = document.documentElement.outerHTML;
    const body = document.body;

    function countMatches(selector) {
      try {
        return document.querySelectorAll(selector).length;
      } catch {
        return 0;
      }
    }

    function hasResource(pattern) {
      const links = Array.from(document.querySelectorAll('link[href], script[src]'));
      return links.some(el => pattern.test(el.href || el.src));
    }

    // Tailwind CSS
    const tailwindEvidence = [];
    if (/\b\w+-\[[^\]]+\]/.test(html)) tailwindEvidence.push('arbitrary values (e.g., top-[117px])');
    if (/(sm|md|lg|xl|2xl|dark|hover|focus|group-hover|peer-):[a-z]/.test(html)) tailwindEvidence.push('responsive/state modifiers');
    if (hasResource(/tailwindcss|tailwind\.css|cdn\.tailwindcss/)) tailwindEvidence.push('stylesheet');
    if (tailwindEvidence.length >= 2) {
      frameworks.push({ name: 'Tailwind CSS', confidence: 'high', evidence: tailwindEvidence.join(', ') });
    }

    // Bootstrap
    const bootstrapEvidence = [];
    const hasContainer = countMatches('.container, .container-fluid') > 0;
    const hasRow = countMatches('.row') > 0;
    const hasCol = countMatches('[class*="col-"]') > 0;
    if (hasContainer && hasRow && hasCol) bootstrapEvidence.push('grid system (container + row + col)');
    if (/\bbtn-primary\b|\bbtn-secondary\b|\bbtn-success\b/.test(html)) bootstrapEvidence.push('button variants');
    if (hasResource(/bootstrap\.min\.css|bootstrap\.css|getbootstrap\.com/)) bootstrapEvidence.push('stylesheet');
    if (bootstrapEvidence.length >= 2) {
      frameworks.push({ name: 'Bootstrap', confidence: 'high', evidence: bootstrapEvidence.join(', ') });
    }

    // Material UI (MUI)
    const muiCount = countMatches('[class*="MuiBox-"], [class*="MuiButton-"], [class*="Mui"]');
    if (muiCount > 3) frameworks.push({ name: 'Material UI (MUI)', confidence: 'high', evidence: `${muiCount} MUI components` });

    // Chakra UI
    const chakraCount = countMatches('[class*="chakra-"]');
    if (chakraCount > 3) frameworks.push({ name: 'Chakra UI', confidence: 'high', evidence: `${chakraCount} Chakra components` });

    // Ant Design
    const antCount = countMatches('[class^="ant-"], [class*=" ant-"]');
    if (antCount > 3) frameworks.push({ name: 'Ant Design', confidence: 'high', evidence: `${antCount} Ant components` });

    // Vuetify
    const vuetifySpecific = countMatches('[class*="v-btn"], [class*="v-card"], [class*="v-app"], [class*="v-toolbar"], [class*="v-navigation"], [class*="v-list"], [class*="v-sheet"]');
    const hasVuetifyTheme = body.classList.contains('theme--light') || body.classList.contains('theme--dark');
    const hasVuetifyApp = countMatches('[class*="v-application"]') > 0;
    if ((vuetifySpecific > 8 && hasVuetifyApp) || (hasVuetifyTheme && vuetifySpecific > 5)) {
      frameworks.push({ name: 'Vuetify', confidence: 'high', evidence: `${vuetifySpecific} Vuetify components` });
    }

    // Shopify Polaris
    const polarisCount = countMatches('[class*="Polaris-"]');
    if (polarisCount > 2) frameworks.push({ name: 'Shopify Polaris', confidence: 'high', evidence: `${polarisCount} Polaris components` });

    // Radix UI
    const radixCount = document.querySelectorAll('[data-radix-], [data-state]').length;
    if (radixCount > 5) frameworks.push({ name: 'Radix UI', confidence: 'high', evidence: `${radixCount} Radix primitives` });

    // DaisyUI
    if (tailwindEvidence.length >= 2) {
      const daisySpecific = countMatches('.btn-primary.btn, .badge, .drawer, .swap, .mockup-code');
      const hasDaisyTheme = body.hasAttribute('data-theme');
      if (daisySpecific > 3 || hasDaisyTheme) {
        frameworks.push({ name: 'DaisyUI', confidence: 'high', evidence: `Tailwind + ${daisySpecific} DaisyUI components` });
      }
    }

    // Foundation
    const foundationEvidence = [];
    if (countMatches('.grid-x, .grid-y, .cell') > 0 || countMatches('.button.primary, .button.secondary') > 0) foundationEvidence.push('grid/button system');
    if (hasResource(/foundation\.min\.css|foundation\.css|zurb\.com\/foundation/)) foundationEvidence.push('stylesheet');
    if (foundationEvidence.length >= 1 || countMatches('[data-foundation]') > 0) {
      frameworks.push({ name: 'Foundation', confidence: 'high', evidence: foundationEvidence.join(', ') || 'data attributes' });
    }

    // Bulma
    const bulmaEvidence = [];
    if (countMatches('.columns, .column') > 0 && countMatches('.column') > 2) bulmaEvidence.push('columns system');
    if (/\bbutton is-primary\b|\bbutton is-link\b/.test(html)) bulmaEvidence.push('button modifiers');
    if (hasResource(/bulma\.min\.css|bulma\.css/)) bulmaEvidence.push('stylesheet');
    if (bulmaEvidence.length >= 2) frameworks.push({ name: 'Bulma', confidence: 'high', evidence: bulmaEvidence.join(', ') });

    // Semantic UI
    const semanticCount = countMatches('.ui.button, .ui.menu, .ui.card, .ui.grid');
    if (semanticCount > 3 || hasResource(/semantic\.min\.css|semantic-ui/)) {
      frameworks.push({ name: 'Semantic UI', confidence: 'high', evidence: `${semanticCount} .ui components` });
    }

    // UIkit
    const uikitCount = countMatches('[class*="uk-"], [uk-grid], [uk-navbar]');
    if (uikitCount > 3 || hasResource(/uikit\.min\.css|getuikit\.com/)) {
      frameworks.push({ name: 'UIkit', confidence: 'high', evidence: `${uikitCount} uk- components` });
    }

    // shadcn/ui
    const shadcnClasses = /\bcn\(|\bslot-\w+|\bdata-\[state=/.test(html);
    const hasShadcnComponents = countMatches('[data-slot], [data-state]') > 5;
    if (tailwindEvidence.length >= 2 && radixCount > 3 && (shadcnClasses || hasShadcnComponents)) {
      frameworks.push({ name: 'shadcn/ui', confidence: 'medium', evidence: 'Tailwind + Radix + component patterns' });
    }

    // Headless UI
    const headlessCount = document.querySelectorAll('[aria-controls][aria-expanded], [role="dialog"][data-headlessui]').length;
    if (tailwindEvidence.length >= 2 && headlessCount > 2) {
      frameworks.push({ name: 'Headless UI', confidence: 'high', evidence: `${headlessCount} headless components with Tailwind` });
    }

    // PrimeReact/Vue/NG
    const primeCount = countMatches('[class*="p-"], .p-component, .p-button, .p-datatable');
    if (primeCount > 5) frameworks.push({ name: 'PrimeReact/Vue/NG', confidence: 'high', evidence: `${primeCount} Prime components` });

    // Mantine
    const mantineCount = countMatches('[class*="mantine-"], [data-mantine]');
    if (mantineCount > 3) frameworks.push({ name: 'Mantine', confidence: 'high', evidence: `${mantineCount} Mantine components` });

    // Carbon Design System
    const carbonCount = countMatches('[class*="cds--"], [class*="bx--"]');
    if (carbonCount > 3) frameworks.push({ name: 'Carbon Design System', confidence: 'high', evidence: `${carbonCount} Carbon components` });

    // Fluent UI
    const fluentCount = countMatches('[class*="ms-"], .ms-Button, .ms-TextField');
    if (fluentCount > 5) frameworks.push({ name: 'Fluent UI', confidence: 'high', evidence: `${fluentCount} Fluent components` });

    // Quasar
    const quasarCount = countMatches('[class*="q-"]');
    if (quasarCount > 5 || body.classList.contains('q-app')) {
      frameworks.push({ name: 'Quasar', confidence: 'high', evidence: `${quasarCount} q- components` });
    }

    // Element Plus/UI
    const elementCount = countMatches('[class*="el-"]');
    if (elementCount > 5) frameworks.push({ name: 'Element Plus/UI', confidence: 'high', evidence: `${elementCount} el- components` });

    return frameworks;
  });
}
