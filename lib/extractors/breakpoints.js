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

export async function extractGradients(page) {
  return await page.evaluate(() => {
    const seen = new Map();

    const els = document.querySelectorAll('*');
    let checked = 0;
    for (const el of els) {
      if (checked++ > 2000) break;
      if (el.style.backgroundImage === 'none') continue;
      if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
      const s = getComputedStyle(el);
      const bg = s.backgroundImage;
      if (!bg || bg === 'none') continue;

      const gradients = [];
      let depth = 0, start = 0;
      for (let i = 0; i < bg.length; i++) {
        if (bg[i] === '(') depth++;
        else if (bg[i] === ')') depth--;
        else if (bg[i] === ',' && depth === 0) {
          gradients.push(bg.slice(start, i).trim());
          start = i + 1;
        }
      }
      gradients.push(bg.slice(start).trim());

      for (const grad of gradients) {
        if (!/^(repeating-)?(linear|radial|conic)-gradient/.test(grad)) continue;

        const base = grad.replace(/^repeating-/, '');
        const repeating = grad.startsWith('repeating-');
        const type = (base.startsWith('linear') ? 'linear' : base.startsWith('radial') ? 'radial' : 'conic') + (repeating ? '-repeating' : '');

        const key = grad.replace(/\s+/g, ' ');
        if (seen.has(key)) {
          seen.get(key).count++;
          continue;
        }

        const stopColors = [];
        const stopRe = /#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\)|oklab\([^)]+\)/gi;
        let m;
        while ((m = stopRe.exec(grad)) !== null) stopColors.push(m[0]);

        seen.set(key, { gradient: key, type, stopColors, count: 1 });
      }
    }

    return Array.from(seen.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  });
}

export async function extractMotion(page) {
  // Phase 1: static pass — collect durations, easings, animations per semantic context
  const staticMotion = await page.evaluate(() => {
    function getContext(el) {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || '';
      const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const hint = cls + ' ' + id + ' ' + role;
      if (tag === 'button' || role === 'button' || hint.includes('btn')) return 'button';
      if (tag === 'a' || role === 'link') return 'link';
      if (tag === 'nav' || role === 'navigation' || hint.includes('nav') || hint.includes('menu')) return 'nav';
      if (hint.includes('modal') || hint.includes('dialog') || hint.includes('overlay') || hint.includes('drawer')) return 'modal';
      if (hint.includes('card') || hint.includes('tile') || hint.includes('item')) return 'card';
      if (hint.includes('hero') || hint.includes('banner') || hint.includes('header')) return 'hero';
      if (hint.includes('tooltip') || hint.includes('popover') || hint.includes('dropdown')) return 'overlay';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'input';
      if (hint.includes('image') || hint.includes('img') || hint.includes('media') || hint.includes('video')) return 'media';
      return 'other';
    }

    function parseDurationMs(val) {
      if (!val || val === '0s') return 0;
      return val.endsWith('ms') ? parseFloat(val) : parseFloat(val) * 1000;
    }

    function classifyEasing(val) {
      if (!val) return null;
      if (val === 'linear') return 'linear';
      if (val === 'ease') return 'ease';
      if (val === 'ease-in') return 'ease-in';
      if (val === 'ease-out') return 'ease-out';
      if (val === 'ease-in-out') return 'ease-in-out';
      // detect spring-like: high y1/y2 overshoot
      const m = val.match(/cubic-bezier\(([\d.]+),\s*([\d.-]+),\s*([\d.]+),\s*([\d.-]+)\)/);
      if (m) {
        const y1 = parseFloat(m[2]), y2 = parseFloat(m[4]);
        if (y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1) return 'spring';
        const x1 = parseFloat(m[1]);
        if (x1 < 0.2) return 'ease-out'; // fast start
        if (x1 > 0.6) return 'ease-in';  // slow start
        return 'custom';
      }
      return 'custom';
    }

    // per-context motion profiles
    const contexts = {};
    const globalDurations = new Map();
    const globalEasings = new Map();
    const globalAnimations = new Map();

    const els = document.querySelectorAll('*');
    let checked = 0;
    for (const el of els) {
      if (checked++ > 3000) break;
      if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
      const s = getComputedStyle(el);

      const rawDurations = (s.transitionDuration || '').split(',').map(v => v.trim()).filter(v => v && v !== '0s');
      const rawEasings = (s.transitionTimingFunction || '').split(/,(?![^(]*\))/).map(v => v.trim()).filter(Boolean);
      const rawProps = (s.transitionProperty || '').split(',').map(v => v.trim());
      const animName = s.animationName;

      if (rawDurations.length === 0 && (!animName || animName === 'none')) continue;

      const ctx = getContext(el);

      // global tallies
      rawDurations.forEach(d => {
        const ms = parseDurationMs(d);
        if (ms <= 0) return;
        const e = globalDurations.get(d) || { value: d, ms, count: 0 };
        e.count++; globalDurations.set(d, e);
      });
      rawEasings.forEach(e => {
        const entry = globalEasings.get(e) || { value: e, type: classifyEasing(e), count: 0 };
        entry.count++; globalEasings.set(e, entry);
      });

      // per-context profile
      if (ctx !== 'other' && rawDurations.length > 0) {
        if (!contexts[ctx]) contexts[ctx] = { durations: new Map(), easings: new Map(), props: new Map(), count: 0 };
        const cx = contexts[ctx];
        cx.count++;
        rawDurations.forEach(d => { const e = cx.durations.get(d) || { value: d, ms: parseDurationMs(d), count: 0 }; e.count++; cx.durations.set(d, e); });
        rawEasings.forEach(e => { const entry = cx.easings.get(e) || { value: e, type: classifyEasing(e), count: 0 }; entry.count++; cx.easings.set(e, entry); });
        rawProps.forEach(p => { if (p && p !== 'all' && p !== 'none') { const e = cx.props.get(p) || { value: p, count: 0 }; e.count++; cx.props.set(p, e); } });
      }

      // animations
      if (animName && animName !== 'none') {
        for (const name of animName.split(',').map(v => v.trim())) {
          if (name === 'none') continue;
          const e = globalAnimations.get(name) || { name, duration: s.animationDuration?.split(',')[0]?.trim(), easing: s.animationTimingFunction?.split(',')[0]?.trim(), count: 0, contexts: new Set() };
          e.count++; e.contexts.add(ctx);
          globalAnimations.set(name, e);
        }
      }
    }

    // serialize
    const serializeCtx = (cx) => ({
      count: cx.count,
      durations: Array.from(cx.durations.values()).sort((a, b) => b.count - a.count).slice(0, 3).map(d => d.value),
      easing: Array.from(cx.easings.values()).sort((a, b) => b.count - a.count)[0]?.value || null,
      easingType: Array.from(cx.easings.values()).sort((a, b) => b.count - a.count)[0]?.type || null,
      props: Array.from(cx.props.values()).sort((a, b) => b.count - a.count).slice(0, 4).map(p => p.value),
    });

    const ctxOut = {};
    for (const [k, v] of Object.entries(contexts)) ctxOut[k] = serializeCtx(v);

    return {
      durations: Array.from(globalDurations.values()).sort((a, b) => a.ms - b.ms),
      easings: Array.from(globalEasings.values()).sort((a, b) => b.count - a.count).slice(0, 8),
      animations: Array.from(globalAnimations.values()).sort((a, b) => b.count - a.count).slice(0, 8).map(a => ({ ...a, contexts: Array.from(a.contexts) })),
      contexts: ctxOut,
    };
  });

  // Phase 2: hover interaction deltas on a sample of interactive elements
  const interactiveDeltas = [];
  try {
    const els = await page.$$('button, a, [role="button"]');
    const sampled = els.slice(0, 12);
    for (const el of sampled) {
      try {
        const visible = await el.evaluate(e => {
          const r = e.getBoundingClientRect();
          const s = getComputedStyle(e);
          return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
        });
        if (!visible) continue;

        const before = await el.evaluate(e => {
          const s = getComputedStyle(e);
          return { transform: s.transform, opacity: s.opacity, bg: s.backgroundColor, color: s.color, tag: e.tagName.toLowerCase(), text: (e.textContent || '').trim().slice(0, 30) };
        });

        await el.hover({ timeout: 800 }).catch(() => {});
        await page.waitForTimeout(120);

        const after = await el.evaluate(e => {
          const s = getComputedStyle(e);
          return { transform: s.transform, opacity: s.opacity, bg: s.backgroundColor, color: s.color };
        }).catch(() => null);

        if (!after) continue;

        const delta = {};
        if (after.transform !== before.transform && after.transform !== 'none') delta.transform = after.transform;
        if (after.opacity !== before.opacity) delta.opacity = { from: before.opacity, to: after.opacity };
        if (after.bg !== before.bg) delta.background = { from: before.bg, to: after.bg };
        if (after.color !== before.color) delta.color = { from: before.color, to: after.color };

        if (Object.keys(delta).length > 0) {
          // classify pattern
          let pattern = 'color-shift';
          if (delta.transform) {
            const t = delta.transform;
            if (/scale\(([\d.]+)/.test(t)) {
              const s = parseFloat(t.match(/scale\(([\d.]+)/)[1]);
              pattern = s > 1 ? 'scale-up' : 'scale-down';
            } else if (/translateY/.test(t)) pattern = 'slide-y';
            else if (/translateX/.test(t)) pattern = 'slide-x';
            else pattern = 'transform';
          } else if (delta.opacity) {
            pattern = parseFloat(delta.opacity.to) > parseFloat(delta.opacity.from) ? 'fade-in' : 'fade-out';
          }

          interactiveDeltas.push({ tag: before.tag, text: before.text, pattern, delta });
        }
      } catch { /* stale element */ }
    }
    await page.mouse.move(0, 0).catch(() => {});
  } catch { /* skip */ }

  return { ...staticMotion, interactiveDeltas };
}
