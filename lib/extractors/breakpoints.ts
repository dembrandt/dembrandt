export async function extractBreakpoints(page) {
  return await page.evaluate(() => {
    const breakpoints = new Set<number>();

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of (sheet.cssRules || []) as any) {
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

export async function extractGradients(page) {
  return await page.evaluate(() => {
    const seen = new Map();

    const els = document.querySelectorAll('*') as any;
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
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 20);
  });
}

export const FREEZE_STYLE_ID = 'dembrandt-freeze-motion';

// Static pass: durations, easings and animations per semantic context. Read
// before the orchestrator freezes animations, so the authored values survive.
export async function extractMotionStatic(page) {
  return await page.evaluate(() => {
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

    const els = document.querySelectorAll('*') as any;
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
    const serializeCtx = (cx: any) => ({
      count: cx.count,
      durations: Array.from(cx.durations.values()).sort((a: any, b: any) => b.count - a.count).slice(0, 3).map((d: any) => d.value),
      easing: (Array.from(cx.easings.values()).sort((a: any, b: any) => b.count - a.count)[0] as any)?.value || null,
      easingType: (Array.from(cx.easings.values()).sort((a: any, b: any) => b.count - a.count)[0] as any)?.type || null,
      props: Array.from(cx.props.values()).sort((a: any, b: any) => b.count - a.count).slice(0, 4).map((p: any) => p.value),
    });

    const ctxOut = {};
    for (const [k, v] of Object.entries(contexts)) ctxOut[k] = serializeCtx(v);

    return {
      durations: Array.from(globalDurations.values()).sort((a, b) => a.ms - b.ms),
      easings: Array.from(globalEasings.values()).sort((a: any, b: any) => b.count - a.count).slice(0, 8),
      animations: Array.from(globalAnimations.values()).sort((a: any, b: any) => b.count - a.count).slice(0, 8).map(a => ({ ...a, contexts: Array.from(a.contexts) })),
      contexts: ctxOut,
    };
  });
}

export async function extractMotion(page, staticSnapshot = null) {
  const staticMotion = staticSnapshot ?? await extractMotionStatic(page);

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

        const before: any = await el.evaluate(e => {
          const s = getComputedStyle(e);
          return { transform: s.transform, opacity: s.opacity, bg: s.backgroundColor, color: s.color, tag: e.tagName.toLowerCase(), text: (e.textContent || '').trim().slice(0, 30) };
        });

        await el.hover({ timeout: 800 }).catch(() => {});
        await page.waitForTimeout(120);

        const after: any = await el.evaluate(e => {
          const s = getComputedStyle(e);
          return { transform: s.transform, opacity: s.opacity, bg: s.backgroundColor, color: s.color };
        }).catch(() => null);

        if (!after) continue;

        const delta: any = {};
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
