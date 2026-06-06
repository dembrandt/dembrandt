/**
 * Multi-Page Result Merger
 *
 * Merges extraction results from multiple pages into a single
 * unified result that is a superset of the single-page result: all single-page
 * fields are preserved, with additional multi-page metadata (pages array,
 * pageCount on palette entries) added.
 */

import { deltaE } from './colors.js';

const DELTA_E_THRESHOLD = 15;

function mergeColors(results) {
  const base = results[0].colors;

  // Pool all palette entries with their source page index
  const allColors = [];
  results.forEach((r, pageIdx) => {
    (r.colors?.palette || []).forEach(c => {
      allColors.push({ ...c, _pageIdx: pageIdx });
    });
  });

  // Perceptual dedup across all pages
  const merged = [];
  const used = new Set();

  for (let i = 0; i < allColors.length; i++) {
    if (used.has(i)) continue;

    const c = allColors[i];
    const similar = [c];
    const pagesSeen = new Set([c._pageIdx]);

    for (let j = i + 1; j < allColors.length; j++) {
      if (used.has(j)) continue;
      try {
        if (deltaE(c.normalized, allColors[j].normalized) < DELTA_E_THRESHOLD) {
          similar.push(allColors[j]);
          pagesSeen.add(allColors[j]._pageIdx);
          used.add(j);
        }
      } catch { /* skip unparseable colors */ }
    }
    used.add(i);

    // Keep variant with highest count as canonical
    const best = similar.sort((a, b) => b.count - a.count)[0];
    const totalCount = similar.reduce((s, x) => s + (x.count || 0), 0);
    const pageCount = pagesSeen.size;

    // Boost confidence when color appears on multiple pages
    let confidence = best.confidence;
    if (pageCount > 1 && confidence === 'low') confidence = 'medium';
    if (pageCount > 2 && confidence === 'medium') confidence = 'high';

    const { _pageIdx, ...clean } = best;
    merged.push({ ...clean, count: totalCount, confidence, pageCount });
  }

  // Semantic: homepage wins, fill missing from other pages
  const semantic = { ...base.semantic };
  for (let i = 1; i < results.length; i++) {
    const s = results[i].colors?.semantic || {};
    for (const [k, v] of Object.entries(s)) {
      if (!semantic[k] && v) semantic[k] = v;
    }
  }

  // CSS variables: union, first occurrence wins
  const cssVariables: Record<string, any> = {};
  results.forEach(r => {
    const vars = r.colors?.cssVariables || {};
    for (const [k, v] of Object.entries(vars)) {
      if (!(k in cssVariables)) cssVariables[k] = v;
    }
  });

  return { ...base, semantic, palette: merged, cssVariables };
}

function mergeTypography(results) {
  const base = results[0].typography || {};

  // Dedup styles by (family, size, weight) tuple, sum counts
  const styleMap = new Map();
  results.forEach(r => {
    (r.typography?.styles || []).forEach(s => {
      const key = `${s.family}|${s.size}|${s.weight}`;
      if (!styleMap.has(key)) {
        styleMap.set(key, { ...s, count: 1 });
      } else {
        styleMap.get(key).count++;
      }
    });
  });

  // Merge sources
  const sources = { ...(base.sources || {}) };
  results.slice(1).forEach(r => {
    const s = r.typography?.sources || {};
    for (const [k, v] of Object.entries(s)) {
      if (Array.isArray(v)) {
        sources[k] = [...new Set([...(sources[k] || []), ...v])];
      } else if (v && !sources[k]) {
        sources[k] = v;
      }
    }
  });

  const styles = [...styleMap.values()].sort((a, b) => parseFloat(b.size) - parseFloat(a.size));
  return { ...base, styles, sources };
}

/**
 * Fingerprint a component by its visual properties.
 * Buttons and links have states.default; badges have top-level props.
 */
function fingerprintComponent(c) {
  const base = c.states?.default || c;
  return [
    base.backgroundColor || '', base.color || '', base.borderRadius || '',
    base.fontSize || '', base.fontWeight || '', base.border || ''
  ].join('|');
}

function mergeComponentArray(arrays) {
  const map = new Map();
  arrays.flat().forEach(item => {
    const key = fingerprintComponent(item);
    if (!map.has(key)) {
      map.set(key, { ...item, count: item.count || 1 });
    } else {
      map.get(key).count += (item.count || 1);
    }
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/**
 * Merge grouped component objects (inputs: {text,checkbox,...}, badges: {all,byVariant}).
 * Preserves the grouping keys and merges each sub-array independently.
 */
function mergeComponentGroups(groupObjects) {
  const grouped: Record<string, any> = {};
  groupObjects.forEach(obj => {
    if (!obj) return;
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val)) {
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(val);
      } else if (typeof val === 'object' && val !== null) {
        // Nested groups like byVariant: { error: [], warning: [], ... }
        if (!grouped[key]) grouped[key] = {};
        for (const [subKey, subArr] of Object.entries(val)) {
          if (Array.isArray(subArr)) {
            if (!grouped[key][subKey]) grouped[key][subKey] = [];
            grouped[key][subKey].push(subArr);
          }
        }
      }
    }
  });

  const merged: Record<string, any> = {};
  for (const [key, val] of Object.entries(grouped)) {
    if (Array.isArray(val)) {
      merged[key] = mergeComponentArray(val);
    } else {
      // Nested groups
      merged[key] = {};
      for (const [subKey, subArrays] of Object.entries(val)) {
        merged[key][subKey] = mergeComponentArray(subArrays);
      }
    }
  }
  return merged;
}

function mergeComponents(results) {
  return {
    buttons: mergeComponentArray(results.map(r => r.components?.buttons || [])),
    inputs:  mergeComponentGroups(results.map(r => r.components?.inputs).filter(Boolean)),
    links:   mergeComponentArray(results.map(r => r.components?.links || [])),
    badges:  mergeComponentGroups(results.map(r => r.components?.badges).filter(Boolean)),
  };
}

function mergeValueArrays(results, getter, valueKey = 'value') {
  const map = new Map();
  results.forEach(r => {
    (getter(r) || []).forEach(item => {
      const key = item[valueKey];
      if (!map.has(key)) {
        map.set(key, { ...item });
      } else {
        const e = map.get(key);
        e.count = (e.count || 0) + (item.count || 1);
        e.frequency = (e.frequency || 0) + (item.frequency || 0);
      }
    });
  });
  return [...map.values()].sort((a, b) => (b.count || b.frequency || 0) - (a.count || a.frequency || 0));
}

function mergeSpacing(results) {
  const base = results[0].spacing || {};
  const values = mergeValueArrays(results, r => r.spacing?.commonValues, 'px');
  return { ...base, commonValues: values };
}

function mergeBorderRadius(results) {
  const base = results[0].borderRadius || {};
  const values = mergeValueArrays(results, r => r.borderRadius?.values);
  // Recompute confidence from aggregated count
  for (const v of values) {
    if (v.count > 10) v.confidence = 'high';
    else if (v.count > 3) v.confidence = 'medium';
  }
  return { ...base, values };
}

function mergeBorders(results) {
  const map = new Map();
  results.forEach(r => {
    (r.borders?.combinations || []).forEach(item => {
      const key = `${item.width}|${item.style}|${item.color}`;
      if (!map.has(key)) {
        map.set(key, { ...item, elements: [...(item.elements || [])] });
      } else {
        const e = map.get(key);
        e.count += (item.count || 1);
        const elementSet = new Set([...(e.elements || []), ...(item.elements || [])]);
        e.elements = [...elementSet].slice(0, 5);
        if (e.count > 10) e.confidence = 'high';
        else if (e.count > 3) e.confidence = 'medium';
      }
    });
  });
  return {
    combinations: [...map.values()].sort((a, b) => b.count - a.count),
  };
}

function mergeShadows(results) {
  const map = new Map();
  results.forEach(r => {
    (r.shadows || []).forEach(s => {
      const key = s.shadow || s.value || JSON.stringify(s);
      if (!map.has(key)) {
        map.set(key, { ...s, count: s.count || 1 });
      } else {
        map.get(key).count += (s.count || 1);
      }
    });
  });
  // Recompute confidence from aggregated count
  for (const s of map.values()) {
    if (s.count > 10) s.confidence = 'high';
    else if (s.count > 3) s.confidence = 'medium';
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function mergeByName(results, getter) {
  const seen = new Set();
  const out = [];
  results.forEach(r => {
    (getter(r) || []).forEach(item => {
      const key = item.name || item.library || JSON.stringify(item);
      if (!seen.has(key)) { seen.add(key); out.push(item); }
    });
  });
  return out;
}

function mergeGradients(results) {
  const map = new Map();
  results.forEach(r => {
    (r.gradients || []).forEach(g => {
      const key = g.gradient;
      if (!map.has(key)) {
        map.set(key, { ...g });
      } else {
        map.get(key).count += (g.count || 1);
      }
    });
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function mergeMotion(results) {
  const base = results[0].motion || { durations: [], easings: [], animations: [], contexts: {}, interactiveDeltas: [] };

  const durationMap = new Map();
  results.forEach(r => {
    (r.motion?.durations || []).forEach(d => {
      if (!durationMap.has(d.value)) durationMap.set(d.value, { ...d });
      else durationMap.get(d.value).count += (d.count || 1);
    });
  });

  const easingMap = new Map();
  results.forEach(r => {
    (r.motion?.easings || []).forEach(e => {
      if (!easingMap.has(e.value)) easingMap.set(e.value, { ...e });
      else easingMap.get(e.value).count += (e.count || 1);
    });
  });

  const animMap = new Map();
  results.forEach(r => {
    (r.motion?.animations || []).forEach(a => {
      if (!animMap.has(a.name || a.value)) animMap.set(a.name || a.value, { ...a });
      else animMap.get(a.name || a.value).count += (a.count || 1);
    });
  });

  return {
    ...base,
    durations: [...durationMap.values()].sort((a, b) => a.ms - b.ms),
    easings: [...easingMap.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    animations: [...animMap.values()].sort((a, b) => b.count - a.count).slice(0, 8),
  };
}

/**
 * Merge an array of per-page result objects into a single unified result.
 * @param {Object[]} results - Array of extractBranding() result objects
 * @returns {Object} Merged result with same shape as single-page result
 */
export function mergeResults(results) {
  if (results.length === 0) throw new Error('No results to merge');
  if (results.length === 1) return results[0];

  const home = results[0];

  return {
    url: home.url,
    extractedAt: home.extractedAt,
    ...(home.meta ? { meta: home.meta } : {}),
    siteName: home.siteName,
    logo: home.logo,
    favicons: home.favicons,
    colors: mergeColors(results),
    typography: mergeTypography(results),
    spacing: mergeSpacing(results),
    borderRadius: mergeBorderRadius(results),
    borders: mergeBorders(results),
    shadows: mergeShadows(results),
    gradients: mergeGradients(results),
    motion: mergeMotion(results),
    components: mergeComponents(results),
    breakpoints: [
      ...new Map(
        results.flatMap(r => r.breakpoints || []).map(b => [b.px, b])
      ).values()
    ].sort((a: any, b: any) => parseInt(b.px) - parseInt(a.px)),
    iconSystem: mergeByName(results, r => r.iconSystem),
    frameworks: mergeByName(results, r => r.frameworks),
    pages: results.map(r => ({ url: r.url, extractedAt: r.extractedAt })),
  };
}
