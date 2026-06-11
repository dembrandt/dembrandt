import chalk from 'chalk';
import { color } from '../formatters/theme.js';
import { discoverLinks } from '../discovery.js';
import { extractLogo, extractSiteName } from './logo.js';
import { extractColors } from './colors.js';
import { extractTypography } from './typography.js';
import { extractSpacing, extractBorderRadius, extractBorders, extractShadows } from './spacing.js';
import { extractButtonStyles, extractInputStyles, extractLinkStyles, extractBadgeStyles } from './components.js';
import { extractBreakpoints, detectIconSystem, detectFrameworks, extractGradients, extractMotion } from './breakpoints.js';
import { extractTeach } from './teach.js';
import { extractWcagPairs } from './colors.js';
import { SCHEMA_VERSION } from '../version.js';
import type { ExtractOptions, BrandingResult, Spinner } from '../types.js';

// Gaussian noise via Box-Muller
function gaussian(mean = 0, std = 1) {
  let u, v;
  do { u = Math.random(); } while (u === 0);
  do { v = Math.random(); } while (v === 0);
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Cubic Bézier interpolation
function bezier(t, p0, p1, p2, p3) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

// Physiological tremor: ~8-12Hz oscillation, amplitude varies with fatigue
function tremor(t, freq, amp) {
  return amp * Math.sin(2 * Math.PI * freq * t) + gaussian(0, amp * 0.3);
}

// Velocity profile: ballistic phase + corrective phase (two-phase Fitts model)
// Humans move fast toward target then make fine corrections — not smooth decel
function velocityProfile(t, overshootProb = 0.3) {
  const hasOvershoot = Math.random() < overshootProb;
  if (t < 0.05) return t / 0.05 * 0.2; // startup latency
  if (t < 0.55) return 0.2 + (t - 0.05) / 0.5; // ballistic acceleration
  if (t < 0.72) return 1.0 - (t - 0.55) / 0.17 * 0.5; // deceleration
  if (hasOvershoot && t < 0.88) return 0.5 + Math.sin((t - 0.72) / 0.16 * Math.PI) * 0.3; // overshoot
  return 0.15 + Math.random() * 0.1; // corrective micro-movements
}

// Sleep helper
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Adaptive readiness: resolve as soon as the page is actually settled — network
 * quiet, web fonts loaded, and the DOM done mutating — instead of always waiting
 * a fixed cap. Falls back to the cap on any failure, so the worst case matches a
 * fixed wait while typical pages finish in a fraction of the time. Every error
 * is swallowed: readiness is best-effort and must never abort extraction.
 */
async function waitForSettled(page, capMs, quietMs = 500) {
  const start = Date.now();
  try { await page.waitForLoadState("networkidle", { timeout: capMs }); } catch {}
  try { await page.evaluate(() => document.fonts?.ready ?? null); } catch {}
  const remaining = Math.max(250, capMs - (Date.now() - start));
  try {
    await page.evaluate(({ quietMs, remaining }) => new Promise<void>((resolve) => {
      const target = document.body || document.documentElement;
      if (!target) return resolve();
      let quiet;
      const finish = () => { try { obs.disconnect(); } catch {} resolve(); };
      const obs = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(finish, quietMs); });
      obs.observe(target, { childList: true, subtree: true, attributes: true, characterData: true });
      quiet = setTimeout(finish, quietMs);       // already quiet -> resolve after one window
      setTimeout(finish, remaining);             // hard cap
    }), { quietMs, remaining });
  } catch {}
  return Date.now() - start;
}

async function simulateHumanMouse(page) {
  const vw = 1920, vh = 1080;

  // Per-session behavioral fingerprint — each "user" has consistent quirks
  const profile = {
    handedness: Math.random() < 0.88 ? 'right' : 'left', // right-handed bias
    tremFreq: 8 + Math.random() * 4,        // physiological tremor 8-12Hz
    tremAmp: 0.2 + Math.random() * 0.6,     // tremor amplitude (fatigue)
    driftBias: { x: gaussian(0, 0.15), y: gaussian(0, 0.08) }, // consistent directional drift
    speedMult: 0.7 + Math.random() * 0.8,   // this person moves fast or slow
    overshootTendency: Math.random(),        // how often they overshoot targets
    attentionSpan: 0.4 + Math.random() * 0.6, // affects dwell times
    fatigueRate: Math.random() * 0.3,        // movements degrade over session
  };

  // Plausible entry: cursor was somewhere from before page load, not 0,0
  // Right-handed users tend to park right-center; left-handed left-center
  const entryX = profile.handedness === 'right'
    ? vw * 0.5 + Math.random() * vw * 0.4
    : vw * 0.1 + Math.random() * vw * 0.4;
  const entryY = vh * 0.15 + Math.random() * vh * 0.5;

  let cx = entryX, cy = entryY;
  await page.mouse.move(cx, cy);

  // Weighted zones: humans spend time in predictable areas of a webpage
  const targetZones = [
    { x: [60, 500], y: [15, 75], weight: 3 },    // navigation — high attention
    { x: [150, 1200], y: [80, 380], weight: 4 },  // hero/above-fold — high attention
    { x: [100, 900], y: [350, 720], weight: 3 },  // body content
    { x: [600, 1800], y: [15, 75], weight: 1 },   // right nav / utility links
    { x: [20, 200], y: [200, 900], weight: 1 },   // left sidebar / margin
    { x: [800, 1400], y: [300, 700], weight: 2 }, // mid-right content
  ];
  const totalWeight = targetZones.reduce((s, z) => s + z.weight, 0);

  function pickZone() {
    let r = Math.random() * totalWeight;
    for (const z of targetZones) { r -= z.weight; if (r <= 0) return z; }
    return targetZones[0];
  }

  const sequences = 3 + Math.floor(Math.random() * 5); // 3-7 movements
  let sessionTime = 0;

  for (let s = 0; s < sequences; s++) {
    const fatigue = 1 + profile.fatigueRate * (s / sequences); // movements get sloppier

    // Occasionally abandon a movement mid-way and redirect (changed mind)
    const willAbort = Math.random() < 0.12;

    const zone = pickZone();
    let tx = zone.x[0] + Math.random() * (zone.x[1] - zone.x[0]);
    let ty = zone.y[0] + Math.random() * (zone.y[1] - zone.y[0]);

    // Aborted movement: pick intermediate abort point
    const abortT = willAbort ? 0.25 + Math.random() * 0.45 : 1.0;
    if (willAbort) {
      // Abort destination is partway toward original target, then we'll redirect
      tx = cx + (tx - cx) * abortT;
      ty = cy + (ty - cy) * abortT;
    }

    const dist = Math.hypot(tx - cx, ty - cy);
    if (dist < 5) continue; // skip negligible movements

    // Two-segment path for longer distances (humans curve around obstacles mentally)
    const useWaypoint = dist > 300 && Math.random() < 0.4;
    const movements = useWaypoint ? [
      // Waypoint slightly off the direct line
      {
        tx: cx + (tx - cx) * (0.3 + Math.random() * 0.25) + gaussian(0, 60),
        ty: cy + (ty - cy) * (0.3 + Math.random() * 0.25) + gaussian(0, 80),
      },
      { tx, ty },
    ] : [{ tx, ty }];

    for (const { tx: etx, ty: ety } of movements) {
      const segDist = Math.hypot(etx - cx, ety - cy);

      // Bézier control points — asymmetric, biased by hand dominance
      const lateralBias = profile.handedness === 'right' ? 1 : -1;
      const cp1x = cx + (etx - cx) * (0.15 + Math.random() * 0.25) + gaussian(0, 35) * fatigue;
      const cp1y = cy + (ety - cy) * (0.05 + Math.random() * 0.2) + gaussian(0, 50) * fatigue + lateralBias * gaussian(0, 15);
      const cp2x = cx + (etx - cx) * (0.65 + Math.random() * 0.25) + gaussian(0, 25) * fatigue;
      const cp2y = cy + (ety - cy) * (0.75 + Math.random() * 0.2) + gaussian(0, 35) * fatigue + lateralBias * gaussian(0, 10);

      // Fitts's law: duration ~ a + b*log2(2D/W), simplified to distance-based
      const targetWidth = 20 + Math.random() * 80; // perceived click target size
      const fittsDuration = (300 + 200 * Math.log2(2 * segDist / targetWidth)) * profile.speedMult * fatigue;
      const steps = Math.max(30, Math.floor(segDist * 0.18 * profile.speedMult));

      let stepTime = 0;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const speed = velocityProfile(t, profile.overshootTendency);
        const stepMs = (fittsDuration / steps) / Math.max(speed, 0.05);

        const mx = bezier(t, cx, cp1x, cp2x, etx);
        const my = bezier(t, cy, cp1y, cp2y, ety);

        // Layered noise: micro-tremor + physiological oscillation + drift bias
        const tSec = (sessionTime + stepTime) / 1000;
        const tx_noise = tremor(tSec, profile.tremFreq, profile.tremAmp * fatigue)
          + profile.driftBias.x * (1 - speed); // drift more when slow
        const ty_noise = tremor(tSec + 0.37, profile.tremFreq * 0.93, profile.tremAmp * 0.7 * fatigue)
          + profile.driftBias.y * (1 - speed);

        await page.mouse.move(mx + tx_noise, my + ty_noise);
        stepTime += stepMs;

        // Attention catch: sudden freeze when "something interesting" is spotted
        if (Math.random() < 0.03) {
          const freezeMs = 80 + Math.random() * 300;
          // During freeze: very slow drift, not absolute stillness
          const freezeSteps = Math.ceil(freezeMs / 16);
          for (let f = 0; f < freezeSteps; f++) {
            await page.mouse.move(
              mx + tx_noise + gaussian(0, 0.2),
              my + ty_noise + gaussian(0, 0.15)
            );
            await sleep(16);
          }
          stepTime += freezeMs;
        } else {
          await sleep(Math.max(1, stepMs));
        }
      }

      cx = etx + gaussian(0, 1.5 * fatigue); // landing imprecision
      cy = ety + gaussian(0, 1.5 * fatigue);
      sessionTime += fittsDuration;
    }

    // Aborted: redirect to new target after brief confusion pause
    if (willAbort) {
      await sleep(80 + Math.random() * 250);
      // Brief backward micro-movement (second-guessing)
      if (Math.random() < 0.5) {
        await page.mouse.move(cx - gaussian(0, 15), cy - gaussian(0, 10));
        await sleep(40 + Math.random() * 80);
      }
    }

    // Dwell: two-phase — initial landing jitter, then resting drift
    const dwellMs = (150 + Math.random() * 1800) * profile.attentionSpan * fatigue;
    const phase1 = dwellMs * 0.3; // landing stabilization
    const phase2 = dwellMs * 0.7; // at-rest

    // Phase 1: damped oscillation as hand settles (like underdamped spring)
    const landingSteps = Math.ceil(phase1 / 16);
    for (let d = 0; d < landingSteps; d++) {
      const decay = Math.exp(-d / landingSteps * 4);
      await page.mouse.move(
        cx + gaussian(0, 1.5 * decay),
        cy + gaussian(0, 1.2 * decay)
      );
      await sleep(16);
    }

    // Phase 2: resting — very slow Brownian drift
    const restSteps = Math.ceil(phase2 / 50);
    let rx = cx, ry = cy;
    for (let d = 0; d < restSteps; d++) {
      rx += gaussian(0, 0.3);
      ry += gaussian(0, 0.2);
      // Slow mean-reversion: hand drifts but not far
      rx += (cx - rx) * 0.05;
      ry += (cy - ry) * 0.05;
      await page.mouse.move(rx, ry);
      await sleep(50);
    }
    cx = rx; cy = ry;

    // Inter-movement gap: bimodal — short gap (quick scan) or long gap (reading)
    const isReading = Math.random() < 0.35;
    const gapMs = isReading
      ? 800 + Math.random() * 2500   // reading pause
      : 80 + Math.random() * 350;    // quick scan gap
    await sleep(gapMs);
    sessionTime += dwellMs + gapMs;
  }
}

/**
 * @param {string} url
 * @param {import('ora').Ora} spinner
 * @param {import('playwright-core').Browser} browser
 * @param {{ slow?: boolean, darkMode?: boolean, mobile?: boolean, wcag?: boolean, screenshotPath?: string, discoverLinks?: number|null, navigationTimeout?: number, stealth?: boolean, userAgent?: string, locale?: string, timezoneId?: string, acceptLanguage?: string, screenSize?: string }} [options]
 * @returns {Promise<BrandingResult>}
 */
export async function extractBranding(url: string, spinner: Spinner, browser: any, options: ExtractOptions = {}): Promise<BrandingResult> {
  const timeoutMultiplier = options.slow ? 3 : 1;
  const timeouts = [];
  const degraded = []; // post-extraction stages that failed but did not abort the run

  // Progress lines print only in verbose mode (the main `dembrandt <url>`
  // command). Report commands (drift/init/conformance) pass no verbose flag and
  // stay clean. Warnings are NOT routed through this — they always print.
  const log = (...args) => { if (options.verbose) console.log(...args); };

  spinner.text = "Creating browser context...";

  const locale = options.locale || "en-US";
  const timezoneId = options.timezoneId || "America/New_York";
  const acceptLanguage = options.acceptLanguage || `${locale},${locale.split('-')[0]};q=0.9,en;q=0.8`;

  const [screenW, screenH] = options.screenSize
    ? options.screenSize.split('x').map(Number)
    : [1920, 1080];

  // Parse "Name=value; Name2=value2" cookie string into Playwright format
  const parsedCookies = options.cookie
    ? options.cookie.split(";").map((c) => c.trim()).filter(Boolean).map((c) => {
        const eq = c.indexOf("=");
        return {
          name: c.slice(0, eq).trim(),
          value: c.slice(eq + 1).trim(),
          url,
        };
      })
    : [];

  const extraHeaders = { "Accept-Language": acceptLanguage };
  if (options.header) {
    const colon = options.header.indexOf(":");
    if (colon > -1) {
      extraHeaders[options.header.slice(0, colon).trim()] = options.header.slice(colon + 1).trim();
    }
  }

  const contextOptions: any = {
    viewport: { width: screenW, height: screenH },
    screen: { width: screenW, height: screenH },
    userAgent: options.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    locale,
    timezoneId,
    extraHTTPHeaders: extraHeaders,
    colorScheme: "light",
  };

  if (browser.browserType().name() === 'chromium') {
    contextOptions.permissions = ["clipboard-read", "clipboard-write"];
  }

  const context = await browser.newContext(contextOptions);

  if (parsedCookies.length > 0) {
    await context.addCookies(parsedCookies);
  }

  if (options.stealth) {
    const stealthLocale = locale;
    await context.addInitScript(({ loc, sw, sh }) => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
      Object.defineProperty(navigator, 'language', { get: () => loc });
      Object.defineProperty(navigator, 'languages', { get: () => [loc, loc.split('-')[0]] });
      Object.defineProperty(screen, 'width', { get: () => sw });
      Object.defineProperty(screen, 'height', { get: () => sh });
      Object.defineProperty(screen, 'availWidth', { get: () => sw });
      Object.defineProperty(screen, 'availHeight', { get: () => sh - 40 }); // taskbar
      Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
      Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
      Object.defineProperty(window, 'devicePixelRatio', { get: () => 1 });
      Object.defineProperty(window, 'outerWidth', { get: () => sw });
      Object.defineProperty(window, 'outerHeight', { get: () => sh });

      // plugins/mimeTypes: headless has none, real Chrome has several
      const pluginData = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ];
      const pluginArray = pluginData.map(p => {
        const plugin = Object.create(Plugin.prototype);
        Object.defineProperty(plugin, 'name', { get: () => p.name });
        Object.defineProperty(plugin, 'filename', { get: () => p.filename });
        Object.defineProperty(plugin, 'description', { get: () => p.description });
        Object.defineProperty(plugin, 'length', { get: () => 0 });
        return plugin;
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => Object.assign(Object.create(PluginArray.prototype), pluginArray, { length: pluginArray.length }),
      });
      Object.defineProperty(navigator, 'mimeTypes', {
        get: () => Object.assign(Object.create(MimeTypeArray.prototype), { length: 0 }),
      });

      // hasFocus: headless often returns false, real browser returns true
      document.hasFocus = () => true;

      // connection: expose a plausible NetworkInformation object
      if (!(navigator as any).connection) {
        Object.defineProperty(navigator, 'connection', {
          get: () => ({ effectiveType: '4g', rtt: 50, downlink: 10, saveData: false }),
        });
      }

      // history.length: fresh context always 1 — nudge to plausible value
      try {
        Object.defineProperty(history, 'length', { get: () => 2 + Math.floor(Math.random() * 4) });
      } catch {}

      (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
      delete (navigator as any).__proto__.webdriver;
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    }, { loc: stealthLocale, sw: screenW, sh: screenH });
  }

  const page = await context.newPage();

  // Track font requests to identify self-hosted custom fonts
  const fontRequests = new Set<string>();
  const thirdPartyFontHosts = ['fonts.googleapis.com', 'fonts.gstatic.com', 'typekit.net',
    'adobe.com', 'fonts.com', 'cloud.typography.com', 'fast.fonts.net', 'use.fontawesome.com',
    'kit.fontawesome.com', 'pro.fontawesome.com'];
  page.on('response', (response) => {
    const resUrl = response.url();
    const ct = response.headers()['content-type'] || '';
    if (ct.includes('font') || resUrl.match(/\.(woff2?|ttf|otf|eot)(\?|$)/i)) {
      try {
        const host = new URL(resUrl).hostname;
        const isThirdParty = thirdPartyFontHosts.some(h => host.includes(h));
        if (!isThirdParty) fontRequests.add(resUrl);
      } catch {}
    }
  });

  try {
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      spinner.text = `Navigating to ${url} (attempt ${attempts}/${maxAttempts})...`;
      try {
        const initialUrl = url;
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: (options.navigationTimeout || 20000) * timeoutMultiplier,
        });
        const finalUrl = page.url();

        if (initialUrl !== finalUrl) {
          spinner.stop();
          const initialDomain = new URL(initialUrl).hostname;
          const finalDomain = new URL(finalUrl).hostname;
          if (initialDomain !== finalDomain) {
            console.log(color.warning(`  ! Page redirected to different domain:`));
            console.log(chalk.dim(`    From: ${initialUrl}`));
            console.log(chalk.dim(`    To:   ${finalUrl}`));
          } else {
            console.log(color.info(`  i Page redirected within same domain:`));
            console.log(chalk.dim(`    From: ${initialUrl}`));
            console.log(chalk.dim(`    To:   ${finalUrl}`));
          }
          spinner.start();
        }

        spinner.stop();
        log(color.success(`  ✓ Page loaded`));

        spinner.start("Waiting for body content to render...");
        try {
          await page.waitForFunction(
            () => document.body && document.body.children.length > 0,
            { timeout: (options.navigationTimeout || 20000) * timeoutMultiplier }
          );
          spinner.stop();
          log(color.success(`  ✓ Body content rendered`));
        } catch {
          spinner.stop();
          console.log(color.warning(`  ! Body content timeout (continuing)`));
          timeouts.push('Body content rendering');
        }

        spinner.start("Waiting for SPA hydration...");
        const elapsed = await waitForSettled(page, 8000 * timeoutMultiplier);
        spinner.stop();
        log(color.success(`  ✓ Hydration settled (${(elapsed / 1000).toFixed(1)}s)`));

        spinner.start("Waiting for main content...");
        try {
          await page.waitForSelector("main, header, [data-hero], section", {
            timeout: 10000 * timeoutMultiplier,
          });
          spinner.stop();
          log(color.success(`  ✓ Main content detected`));
        } catch {
          spinner.stop();
          console.log(color.warning(`  ! Main content selector timeout (continuing)`));
          timeouts.push('Main content selector');
        }

        if (options.stealth) {
          await simulateHumanMouse(page);
        }

        spinner.start("Scrolling page to trigger lazy content...");
        await page.evaluate(async () => {
          const scrollStep = 600;
          const maxHeight = Math.min(document.body.scrollHeight, 30000);
          let y = 0;
          while (y < maxHeight) {
            y = Math.min(y + scrollStep, maxHeight);
            window.scrollTo(0, y);
            await new Promise(r => setTimeout(r, 100));
          }
          window.scrollTo(0, 0);
        });
        spinner.stop();
        log(color.success(`  ✓ Full page scrolled (lazy content triggered)`));

        spinner.start("Dismissing cookie consent banners...");
        const dismissed = await page.evaluate(async () => {
          const selectors = [
            // Generic accept patterns
            'button[id*="accept"]', 'button[class*="accept"]',
            'button[id*="agree"]', 'button[class*="agree"]',
            'button[id*="consent"]', 'button[class*="consent"]',
            '[data-testid*="accept"]', '[data-testid*="agree"]',
            // Common consent libraries
            '#onetrust-accept-btn-handler',
            '.cc-btn.cc-allow', '.cc-accept',
            '[aria-label*="Accept"]', '[aria-label*="agree"]',
            // EU/GDPR common patterns
            'button[data-cookiebanner]',
            '.cookiebanner button', '#cookiebanner button',
            '[class*="cookie"] button[class*="primary"]',
            '[id*="cookie"] button[class*="primary"]',
            '[class*="gdpr"] button', '[id*="gdpr"] button',
            // CMP patterns
            '.sp-message-open .message-button',
            '#sp-cc-accept', '.optanon-allow-all',
          ];
          for (const sel of selectors) {
            try {
              const el = document.querySelector(sel) as HTMLElement | null;
              if (el && el.offsetParent !== null) {
                el.click();
                return sel;
              }
            } catch {}
          }
          return null;
        });
        spinner.stop();
        if (dismissed) {
          log(color.success(`  ✓ Cookie banner dismissed (${dismissed})`));
          await page.waitForTimeout(600);
        } else {
          console.log(color.info(`  i No cookie banner detected`));
        }

        spinner.start("Dismissing region/interstitial modals...");
        // Defensive throughout: this runs on hostile third-party DOM, and a
        // click can navigate the page (destroying the execution context). Every
        // step is isolated so one failure never aborts extraction, and the
        // page.evaluate call itself is guarded on the Node side.
        let modalActions: string[] = [];
        try {
          modalActions = await page.evaluate(async () => {
            const actions: string[] = [];
            const MAX_CANDIDATES = 60; // bound work on pathological DOMs
            const TEXT_CAP = 80; // cap before regex to avoid wasted work

            const isVisible = (el: Element | null): boolean => {
              try {
                if (!el) return false;
                const h = el as HTMLElement;
                return (
                  h.offsetParent !== null ||
                  (typeof h.getClientRects === "function" && h.getClientRects().length > 0)
                );
              } catch {
                return false;
              }
            };
            const safeClick = (el: Element | null): boolean => {
              try {
                if (el && typeof (el as HTMLElement).click === "function") {
                  (el as HTMLElement).click();
                  return true;
                }
              } catch {}
              return false;
            };

            // Pass 1 — close affordances. Region/locale selectors, newsletter
            // and promo popups, and app-install banners block the page and have
            // no bearing on branding. Close them rather than making a choice.
            const closeSelectors = [
              // Region / locale modals (e.g. uk-region-modal__close)
              '[data-modal-close]',
              '[class*="region-modal"] [class*="close"]',
              '[class*="region"][class*="modal"] button[aria-label*="close" i]',
              '[class*="locale"][class*="modal"] [class*="close"]',
              // Newsletter / promo / discount popups (vendor-specific)
              '.klaviyo-close-form',
              '.privy-close', '[class*="privy"] [class*="close"]',
              '[id^="om-"] .popup-close', '[id^="om-"] [class*="close"]',
              '[class*="newsletter"] [aria-label*="close" i]',
              '[class*="newsletter"] [class*="close"]',
              '[class*="subscribe"] [aria-label*="close" i]',
              '[class*="popup"] button[aria-label*="close" i]',
              '[class*="popup"] button[class*="close"]',
              // App-install / smart banners (render under --mobile)
              '[class*="smart-banner"] [class*="close"]',
              '[class*="app-banner"] [class*="dismiss"]',
              '[class*="app-banner"] [class*="close"]',
              // Generic modal/dialog close affordances
              '[role="dialog"] button[aria-label*="close" i]',
              '[class*="modal"] button[aria-label*="close" i]',
              '[class*="modal"] button[class*="close"]',
              '[class*="overlay"] button[aria-label*="close" i]',
              'button[aria-label="Close" i]',
              '[data-dismiss="modal"]',
            ];
            try {
              for (const sel of closeSelectors) {
                try {
                  const el = document.querySelector(sel);
                  if (el && isVisible(el) && safeClick(el)) {
                    actions.push(`close:${sel}`);
                    break;
                  }
                } catch {}
              }
            } catch {}

            // Pass 2 — age gates. Alcohol/cannabis/tobacco gates have no close
            // button; they require an affirmative click. Match button text and
            // scope to a visible gate container so we never hit a "No" / decline
            // path that redirects away.
            const affirmative =
              /^(yes|enter|i am over|i'?m over|over 18|over 21|18\+|21\+|enter site|i am of age|confirm.*age|agree)/i;
            const decline = /\b(no|under|exit|leave|decline)\b/i;
            const gateContainers = [
              '[class*="age"][class*="gate"]',
              '[class*="age"][class*="verif"]',
              '[class*="age-check"]',
              '[id*="age"][class*="modal"]',
              '[role="dialog"][class*="age"]',
            ];
            try {
              gate: for (const csel of gateContainers) {
                let container: Element | null = null;
                try { container = document.querySelector(csel); } catch {}
                if (!container || !isVisible(container)) continue;
                let candidates: Element[] = [];
                try {
                  candidates = Array.from(
                    container.querySelectorAll(
                      'button, a, [role="button"], input[type="submit"], input[type="button"]'
                    )
                  ).slice(0, MAX_CANDIDATES);
                } catch {}
                for (const el of candidates) {
                  try {
                    if (!isVisible(el)) continue;
                    const raw =
                      el.textContent ||
                      (el as HTMLInputElement).value ||
                      el.getAttribute("aria-label") ||
                      "";
                    const text = String(raw).trim().slice(0, TEXT_CAP);
                    if (!text) continue;
                    if (affirmative.test(text) && !decline.test(text)) {
                      if (safeClick(el)) {
                        actions.push(`age-gate:${csel}`);
                        break gate;
                      }
                    }
                  } catch {}
                }
              }
            } catch {}

            return actions;
          });
        } catch (err) {
          // A click navigated the page and destroyed the execution context.
          // That is a successful dismissal, not a failure — note it and move on;
          // the stabilization wait below absorbs the navigation.
          modalActions = ["dismissed (page navigated)"];
        }
        spinner.stop();
        if (modalActions.length > 0) {
          log(color.success(`  ✓ Interstitial dismissed (${modalActions.join(", ")})`));
          try { await page.waitForTimeout(600); } catch {}
        } else {
          console.log(color.info(`  i No interstitial modal detected`));
        }

        spinner.start("Final content stabilization...");
        await waitForSettled(page, 4000 * timeoutMultiplier, 400);
        spinner.stop();
        log(color.success(`  ✓ Page fully loaded and stable`));

        spinner.start("Validating page content...");
        const contentLength = await page.evaluate(() => document.body.textContent.length);
        spinner.stop();

        if (contentLength > 100) {
          log(color.success(`  ✓ Content validated: ${contentLength} chars`));
          break;
        }

        spinner.warn(`Page seems empty (attempt ${attempts}/${maxAttempts}), retrying...`);
        console.log(color.warning(`  ! Content length: ${contentLength} chars (expected >100)`));
        await page.waitForTimeout(3000 * timeoutMultiplier);
      } catch (err) {
        if (attempts >= maxAttempts) {
          console.error(`  ↳ Failed after ${maxAttempts} attempts`);
          console.error(`  ↳ Last error: ${err.message}`);
          console.error(`  ↳ URL: ${url}`);
          throw err;
        }
        spinner.warn(`Navigation failed (attempt ${attempts}/${maxAttempts}), retrying...`);
        console.log(`  ↳ Error: ${err.message}`);
        await page.waitForTimeout(3000 * timeoutMultiplier);
      }
    }

    spinner.stop();

    // Determinism: drive every animation and transition to its final frame, then
    // hold it. Animated elements (cycling hero swatches, fade-ins) otherwise
    // report a different computed value on each run, producing phantom drift.
    // 1ms duration + iteration-count:1 + fill-mode:forwards snaps finite and
    // infinite animations to a stable end state. Opt out with keepAnimations.
    if (!options.keepAnimations) {
      try {
        await page.addStyleTag({
          content: `*, *::before, *::after {
            animation-duration: 1ms !important;
            animation-delay: 0ms !important;
            animation-iteration-count: 1 !important;
            animation-fill-mode: forwards !important;
            transition-duration: 1ms !important;
            transition-delay: 0ms !important;
            scroll-behavior: auto !important;
          }`,
        });
        await page.waitForTimeout(200 * timeoutMultiplier);
      } catch {
        // best-effort; never block extraction on animation freezing
      }
    }

    log(color.info("\n  Extracting design tokens...\n"));

    spinner.start("Analyzing design system (17 parallel tasks)...");
    const [
      logoResult,
      colors,
      typography,
      spacing,
      borderRadius,
      borders,
      shadows,
      buttons,
      inputs,
      links,
      badges,
      breakpoints,
      iconSystem,
      frameworks,
      siteNameRaw,
      gradients,
      motion,
    ] = await Promise.all([
      extractLogo(page, url).catch(() => ({ logo: null, instances: [], favicons: [], manifest: null })),
      extractColors(page).catch(() => ({ semantic: {}, palette: [], cssVariables: [], _raw: [] })),
      extractTypography(page).catch(() => ({ styles: [], sources: {} })),
      extractSpacing(page).catch(() => ({ scaleType: 'unknown', commonValues: [] })),
      extractBorderRadius(page).catch(() => ({ values: [] })),
      extractBorders(page).catch(() => ({ combinations: [] })),
      extractShadows(page).catch(() => []),
      extractButtonStyles(page).catch(() => []),
      extractInputStyles(page).catch(() => []),
      extractLinkStyles(page).catch(() => []),
      extractBadgeStyles(page).catch(() => ({ all: [], byVariant: {} })),
      extractBreakpoints(page).catch(() => []),
      detectIconSystem(page).catch(() => []),
      detectFrameworks(page).catch(() => []),
      extractSiteName(page).catch(() => null),
      extractGradients(page).catch(() => []),
      extractMotion(page).catch(() => ({ durations: [], easings: [], byContext: {} })),
    ]);

    const { logo, instances: logoInstances, favicons, manifest } = logoResult;
    let siteName = siteNameRaw;

    spinner.stop();

    // Inject manifest theme_color / background_color as high-confidence palette entries
    try {
    if (manifest) {
      const manifestColorEntries = [
        manifest.themeColor && { color: manifest.themeColor, label: 'manifest:theme_color' },
        manifest.backgroundColor && { color: manifest.backgroundColor, label: 'manifest:background_color' },
      ].filter(Boolean);

      const rawManifestColors = manifestColorEntries.map(e => e.color);
      const manifestNormMap = rawManifestColors.length ? await page.evaluate((cols) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        const out = {};
        for (const c of cols) {
          if (/^#[0-9a-f]{6}$/i.test(c)) { out[c] = c.toLowerCase(); continue; }
          if (/^#[0-9a-f]{3}$/i.test(c)) { out[c] = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`.toLowerCase(); continue; }
          if (/^#[0-9a-f]{8}$/i.test(c)) { out[c] = c.toLowerCase().slice(0, 7); continue; }
          const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (m) { out[c] = `#${parseInt(m[1]).toString(16).padStart(2,'0')}${parseInt(m[2]).toString(16).padStart(2,'0')}${parseInt(m[3]).toString(16).padStart(2,'0')}`; continue; }
          if (ctx) {
            try {
              ctx.clearRect(0, 0, 1, 1);
              ctx.fillStyle = 'rgba(0,0,0,0)';
              ctx.fillStyle = c;
              ctx.fillRect(0, 0, 1, 1);
              const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
              if (a > 0) { out[c] = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`; continue; }
            } catch {}
          }
          out[c] = c.toLowerCase();
        }
        return out;
      }, rawManifestColors) : {};

      for (const { color: raw, label } of manifestColorEntries) {
        const normalized = manifestNormMap[raw] ?? raw.toLowerCase();
        if (!colors.palette.some(c => c.normalized === normalized)) {
          colors.palette.push({ color: raw, normalized, count: 10, confidence: 'high', sources: [label] });
        } else {
          const existing = colors.palette.find(c => c.normalized === normalized);
          if (existing) {
            existing.confidence = 'high';
            if (!existing.sources.includes(label)) existing.sources.push(label);
          }
        }
      }

      if (!siteName && (manifest.name || manifest.shortName)) {
        siteName = manifest.name || manifest.shortName;
      }
    }

    if (manifest) {
      const parts = [
        manifest.themeColor && `theme: ${manifest.themeColor}`,
        manifest.backgroundColor && `bg: ${manifest.backgroundColor}`,
        manifest.name && `name: "${manifest.name}"`,
      ].filter(Boolean);
      log(color.success(`  ✓ Manifest: ${parts.join(', ')}`));
    }
    } catch (e) { degraded.push('manifest'); console.log(color.warning('  ! Manifest injection: failed (continuing)')); }
    console.log(colors.palette.length > 0 ? color.success(`  ✓ Colors: ${colors.palette.length} found`) : color.warning(`  ! Colors: 0 found`));
    console.log(typography.styles.length > 0 ? color.success(`  ✓ Typography: ${typography.styles.length} styles`) : color.warning(`  ! Typography: 0 styles`));
    console.log(spacing.commonValues.length > 0 ? color.success(`  ✓ Spacing: ${spacing.commonValues.length} values`) : color.warning(`  ! Spacing: 0 values`));
    console.log(borderRadius.values.length > 0 ? color.success(`  ✓ Border radius: ${borderRadius.values.length} values`) : color.warning(`  ! Border radius: 0 values`));

    const bordersTotal = (borders?.combinations?.length || 0);
    console.log(bordersTotal > 0 ? color.success(`  ✓ Borders: ${bordersTotal} combinations`) : color.warning(`  ! Borders: 0 found`));
    console.log(shadows.length > 0 ? color.success(`  ✓ Shadows: ${shadows.length} found`) : color.warning(`  ! Shadows: 0 found`));
    console.log(buttons.length > 0 ? color.success(`  ✓ Buttons: ${buttons.length} variants`) : color.warning(`  ! Buttons: 0 variants`));
    console.log(inputs.text?.length > 0 ? color.success(`  ✓ Inputs: found`) : color.warning(`  ! Inputs: 0 styles`));
    console.log(links.length > 0 ? color.success(`  ✓ Links: ${links.length} styles`) : color.warning(`  ! Links: 0 styles`));
    console.log(breakpoints.length > 0 ? color.success(`  ✓ Breakpoints: ${breakpoints.length} detected`) : color.warning(`  ! Breakpoints: 0 detected`));
    console.log(iconSystem.length > 0 ? color.success(`  ✓ Icon systems: ${iconSystem.length} detected`) : color.warning(`  ! Icon systems: 0 detected`));
    console.log(frameworks.length > 0 ? color.success(`  ✓ Frameworks: ${frameworks.length} detected`) : color.warning(`  ! Frameworks: 0 detected`));
    console.log(gradients.length > 0 ? color.success(`  ✓ Gradients: ${gradients.length} found`) : color.info(`  · Gradients: 0 found`));
    console.log(motion.durations.length > 0 ? color.success(`  ✓ Motion: ${motion.durations.length} durations, ${motion.easings.length} easings`) : color.info(`  · Motion: none detected`));
    console.log();

    // Hover/focus state extraction
    const hoverFocusColors = [];
    const interactiveStatePairs = []; // { fg, bg, state, tag } — raw rgb strings, normalized later (consumed by WCAG stage)
    try {
    spinner.start("Extracting hover/focus state colors...");

    function splitMultiValueColors(colorValue) {
      if (!colorValue) return [];
      const colorRegex = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;
      const matches = colorValue.match(colorRegex) || [colorValue];
      return matches.filter(c =>
        c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)' && c !== 'rgba(0,0,0,0)' && c.length > 3
      );
    }

    const interactiveElements = await page.$$(`
      a, button, input, textarea, select,
      [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="switch"],
      [role="checkbox"], [role="radio"], [role="textbox"], [role="searchbox"], [role="combobox"],
      [aria-pressed], [aria-expanded], [aria-current],
      [tabindex]:not([tabindex="-1"])
    `);

    const sampled = interactiveElements.slice(0, 20);

    for (const element of sampled) {
      try {
        const isVisible = await element.evaluate(el => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
        if (!isVisible) continue;

        const beforeState = await element.evaluate(el => {
          function findBg(node) {
            while (node && node.tagName !== 'HTML') {
              const bg = getComputedStyle(node).backgroundColor;
              if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
              node = node.parentElement;
            }
            return null;
          }
          const computed = getComputedStyle(el);
          return { color: computed.color, backgroundColor: computed.backgroundColor, resolvedBg: findBg(el), borderColor: computed.borderColor, tag: el.tagName.toLowerCase() };
        });

        const hovered = await element.hover({ timeout: 1000 * timeoutMultiplier }).then(() => true).catch(() => false);
        await page.waitForTimeout(100 * timeoutMultiplier);

        const afterHover = await element.evaluate(el => {
          function findBg(node) {
            while (node && node.tagName !== 'HTML') {
              const bg = getComputedStyle(node).backgroundColor;
              if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
              node = node.parentElement;
            }
            return null;
          }
          const computed = getComputedStyle(el);
          return { color: computed.color, backgroundColor: computed.backgroundColor, resolvedBg: findBg(el), borderColor: computed.borderColor };
        }).catch(() => null);

        if (!afterHover) continue;

        if (afterHover.color !== beforeState.color && afterHover.color !== 'rgba(0, 0, 0, 0)' && afterHover.color !== 'transparent') {
          hoverFocusColors.push({ color: afterHover.color, property: 'color', state: 'hover', element: beforeState.tag });
        }
        if (afterHover.backgroundColor !== beforeState.backgroundColor && afterHover.backgroundColor !== 'rgba(0, 0, 0, 0)' && afterHover.backgroundColor !== 'transparent') {
          hoverFocusColors.push({ color: afterHover.backgroundColor, property: 'background-color', state: 'hover', element: beforeState.tag });
        }
        if (afterHover.borderColor !== beforeState.borderColor) {
          const hoverBorderColors = splitMultiValueColors(afterHover.borderColor);
          const beforeBorderColors = splitMultiValueColors(beforeState.borderColor);
          hoverBorderColors.forEach(color => {
            if (!beforeBorderColors.includes(color)) {
              hoverFocusColors.push({ color, property: 'border-color', state: 'hover', element: beforeState.tag });
            }
          });
        }

        // Collect hover contrast pair only if hover actually changed styles
        const hoverFg = afterHover.color;
        const hoverBg = afterHover.resolvedBg;
        if (hovered && hoverFg && hoverBg && (hoverFg !== beforeState.color || hoverBg !== beforeState.resolvedBg)) {
          interactiveStatePairs.push({ fg: hoverFg, bg: hoverBg, state: 'hover', tag: beforeState.tag });
        }

        if (['input', 'textarea', 'select', 'button', 'a'].includes(beforeState.tag)) {
          try {
            await element.focus({ timeout: 500 * timeoutMultiplier });
            await page.waitForTimeout(100 * timeoutMultiplier);
            const afterFocus = await element.evaluate(el => {
              function findBg(node) {
                while (node && node.tagName !== 'HTML') {
                  const bg = getComputedStyle(node).backgroundColor;
                  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
                  node = node.parentElement;
                }
                return null;
              }
              const computed = getComputedStyle(el);
              return { color: computed.color, backgroundColor: computed.backgroundColor, resolvedBg: findBg(el), borderColor: computed.borderColor, outlineColor: computed.outlineColor };
            });
            if (afterFocus.outlineColor && afterFocus.outlineColor !== 'rgba(0, 0, 0, 0)' && afterFocus.outlineColor !== 'transparent' && afterFocus.outlineColor !== beforeState.color) {
              hoverFocusColors.push({ color: afterFocus.outlineColor, property: 'outline-color', state: 'focus', element: beforeState.tag });
            }
            if (afterFocus.borderColor !== beforeState.borderColor && afterFocus.borderColor !== afterHover.borderColor) {
              const focusBorderColors = splitMultiValueColors(afterFocus.borderColor);
              const beforeBorderColors = splitMultiValueColors(beforeState.borderColor);
              focusBorderColors.forEach(color => {
                if (!beforeBorderColors.includes(color)) {
                  hoverFocusColors.push({ color, property: 'border-color', state: 'focus', element: beforeState.tag });
                }
              });
            }

            // Collect focus contrast pair
            const focusFg = afterFocus.color;
            const focusBg = afterFocus.resolvedBg;
            if (focusFg && focusBg && (focusFg !== beforeState.color || focusBg !== beforeState.resolvedBg)) {
              interactiveStatePairs.push({ fg: focusFg, bg: focusBg, state: 'focus', tag: beforeState.tag });
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    // Collect disabled element pairs
    try {
      const disabledPairs = await page.evaluate(() => {
        function findBg(node) {
          while (node && node.tagName !== 'HTML') {
            const bg = getComputedStyle(node).backgroundColor;
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
            node = node.parentElement;
          }
          return null;
        }
        const els = document.querySelectorAll('button[disabled], input[disabled], [aria-disabled="true"], [disabled]');
        const pairs = [];
        for (const el of Array.from(els).slice(0, 10)) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const s = getComputedStyle(el);
          const fg = s.color;
          const bg = findBg(el);
          if (fg && bg) pairs.push({ fg, bg, state: 'disabled', tag: el.tagName.toLowerCase() });
        }
        return pairs;
      });
      interactiveStatePairs.push(...disabledPairs);
    } catch (e) {}

    await page.mouse.move(0, 0).catch(() => {});

    // Batch-normalize hover/focus colors via browser canvas to handle oklab/oklch/lab
    const rawHoverColors = [...new Set(hoverFocusColors.map(h => h.color).filter(Boolean))];
    const hoverColorMap = rawHoverColors.length ? await page.evaluate((cols) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      const out = {};
      for (const color of cols) {
        const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) { out[color] = `#${parseInt(m[1]).toString(16).padStart(2,'0')}${parseInt(m[2]).toString(16).padStart(2,'0')}${parseInt(m[3]).toString(16).padStart(2,'0')}`; continue; }
        if (/^#[0-9a-f]{6}$/i.test(color)) { out[color] = color.toLowerCase(); continue; }
        if (ctx) {
          try {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = 'rgba(0,0,0,0)';
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            if (a > 0) { out[color] = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`; continue; }
          } catch {}
        }
        out[color] = color.toLowerCase();
      }
      return out;
    }, rawHoverColors) : {};

    hoverFocusColors.forEach(({ color, property }) => {
      const normalized = hoverColorMap[color] || color.toLowerCase();
      const isDuplicate = colors.palette.some((c) => c.normalized === normalized);
      if (!isDuplicate && color) {
        if (property !== 'background-color') {
          const hex = normalized.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;
          if (saturation > 0.3) return;
        }
        colors.palette.push({ color, normalized, count: 1, confidence: "medium", sources: ["hover/focus"] });
      }
    });

    spinner.stop();
    console.log(hoverFocusColors.length > 0 ?
      color.success(`  ✓ Hover/focus: ${hoverFocusColors.length} state colors found`) :
      color.warning(`  ! Hover/focus: 0 state colors found`));
    } catch (e) { spinner.stop(); degraded.push('hover-focus'); console.log(color.warning('  ! Hover/focus: failed (continuing)')); }

    // Dark mode
    if (options.darkMode) {
      try {
      spinner.start("Extracting dark mode colors...");
      await page.evaluate(() => {
        document.documentElement.setAttribute("data-theme", "dark");
        document.documentElement.setAttribute("data-mode", "dark");
        document.body.setAttribute("data-theme", "dark");
        document.documentElement.classList.add("dark", "dark-mode", "theme-dark");
        document.body.classList.add("dark", "dark-mode", "theme-dark");
      });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForTimeout(500 * timeoutMultiplier);

      const darkModeColors = await extractColors(page);
      const darkModeButtons = await extractButtonStyles(page);
      const darkModeLinks = await extractLinkStyles(page);

      const mergedPalette = [...colors.palette];
      darkModeColors.palette.forEach((darkColor) => {
        const isDuplicate = mergedPalette.some((c) => c.normalized === darkColor.normalized);
        if (!isDuplicate) mergedPalette.push({ ...darkColor, source: "dark-mode" });
      });
      colors.palette = mergedPalette;
      Object.assign(colors.semantic, darkModeColors.semantic);
      buttons.push(...darkModeButtons.map((btn) => ({ ...btn, source: "dark-mode" })));
      links.push(...darkModeLinks.map((link) => ({ ...link, source: "dark-mode" })));

      spinner.stop();
      log(color.success(`  ✓ Dark mode: +${darkModeColors.palette.length} colors`));
      } catch (e) { spinner.stop(); degraded.push('dark-mode'); log(color.warning('  ! Dark mode: failed (continuing)')); }
    }

    // Mobile viewport
    if (options.mobile) {
      try {
      spinner.start("Extracting mobile viewport colors...");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500 * timeoutMultiplier);

      const mobileColors = await extractColors(page);
      const mergedPalette = [...colors.palette];
      mobileColors.palette.forEach((mobileColor) => {
        const isDuplicate = mergedPalette.some((c) => c.normalized === mobileColor.normalized);
        if (!isDuplicate) mergedPalette.push({ ...mobileColor, source: "mobile" });
      });
      colors.palette = mergedPalette;

      spinner.stop();
      log(color.success(`  ✓ Mobile: +${mobileColors.palette.length} colors`));
      } catch (e) { spinner.stop(); degraded.push('mobile'); log(color.warning('  ! Mobile: failed (continuing)')); }
    }

    spinner.stop();
    console.log();
    log(color.success.bold("✓ Brand extraction complete!"));

    if (timeouts.length > 0 && !options.slow) {
      console.log();
      console.log(color.warning(`! ${timeouts.length} timeout(s) occurred during extraction:`));
      timeouts.forEach(t => console.log(chalk.dim(`  • ${t}`)));
      console.log();
      console.log(color.info(`💡 Tip: Try running with ${chalk.bold('--slow')} flag for more reliable results on slow-loading sites`));
    }

    let wcag = [];
    if (options.wcag) {
      spinner.start("Analyzing WCAG contrast pairs...");
      try {
        const { relativeLuminance } = await import('../colors.js');

        function calcPair(fgRaw, bgRaw, extra = {}) {
          const toHex = (c) => {
            const m = c && c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (!m) return null;
            return `#${parseInt(m[1]).toString(16).padStart(2,'0')}${parseInt(m[2]).toString(16).padStart(2,'0')}${parseInt(m[3]).toString(16).padStart(2,'0')}`;
          };
          const fg = toHex(fgRaw) || fgRaw;
          const bg = toHex(bgRaw) || bgRaw;
          if (!fg || !bg || fg === bg) return null;
          const l1 = relativeLuminance(fg);
          const l2 = relativeLuminance(bg);
          if (l1 === null || l2 === null) return null;
          const lighter = Math.max(l1, l2);
          const darker = Math.min(l1, l2);
          const ratio = Math.round((lighter + 0.05) / (darker + 0.05) * 100) / 100;
          return { fg, bg, ratio, aa: ratio >= 4.5, aaLarge: ratio >= 3, aaa: ratio >= 7, ...extra };
        }

        wcag = await extractWcagPairs(page);

        // Deduplicate and score interactive state pairs
        const seenState = new Set();
        for (const { fg, bg, state, tag } of interactiveStatePairs) {
          const key = `${state}/${fg}/${bg}`;
          if (seenState.has(key)) continue;
          seenState.add(key);
          const pair = calcPair(fg, bg, { state, tag, source: 'state' });
          if (pair) wcag.push(pair);
        }

        spinner.stop();
        const staticPassing = wcag.filter(p => !p.source && p.aa).length;
        const staticTotal = wcag.filter(p => !p.source).length;
        const statesFailing = wcag.filter(p => p.source === 'state' && !p.aa).length;
        log(color.success(`  ✓ WCAG: ${staticPassing}/${staticTotal} pairs pass AA`) +
          (statesFailing ? color.warning(` · ${statesFailing} state pair(s) fail`) : ''));
      } catch {
        spinner.stop();
      }
    }

    const result: any = {
      url: page.url(),
      extractedAt: new Date().toISOString(),
      meta: {
        dembrandtVersion: options._version || null,
        schemaVersion: SCHEMA_VERSION,
        flags: {
          ...(options.stealth && { stealth: true }),
          ...(options.darkMode && { darkMode: true }),
          ...(options.mobile && { mobile: true }),
          ...(options.slow && { slow: true }),
          ...(options.userAgent && { userAgent: options.userAgent }),
          ...(options.locale && { locale: options.locale }),
          ...(options.timezoneId && { timezone: options.timezoneId }),
          ...(options.acceptLanguage && { acceptLanguage: options.acceptLanguage }),
          ...(options.screenSize && { screenSize: options.screenSize }),
        },
      },
      siteName,
      logo,
      logoInstances,
      favicons,
      ...(manifest ? { manifest } : {}),
      colors,
      typography: {
        ...typography,
        sources: {
          ...typography.sources,
          selfHostedFonts: [...fontRequests].map(u => u.split('/').pop().split('?')[0]),
          customFonts: typography.sources?.customFonts?.length
            ? typography.sources.customFonts
            : fontRequests.size > 0 ? [...fontRequests].map(u => u.split('/').pop().split('?')[0]) : [],
        }
      },
      spacing,
      borderRadius,
      borders,
      shadows,
      gradients,
      motion,
      components: { buttons, inputs, links, badges },
      breakpoints,
      iconSystem,
      frameworks,
      ...(options.wcag ? { wcag } : {}),
    };

    let isCanvasOnly = false;
    try {
      isCanvasOnly = await page.evaluate(() => {
        const canvases = document.querySelectorAll("canvas");
        const hasRealContent = document.body.textContent.trim().length > 200;
        const hasManyCanvases = canvases.length > 3;
        const hasWebGL = Array.from(canvases).some((c) => {
          const ctx = c.getContext("webgl") || c.getContext("webgl2");
          return !!ctx;
        });
        return hasManyCanvases && hasWebGL && !hasRealContent;
      });
    } catch { isCanvasOnly = false; }

    if (isCanvasOnly) {
      result.note = "This website uses canvas/WebGL rendering. Design system cannot be extracted from DOM.";
      result.isCanvasOnly = true;
    }

    if (options.screenshotPath) {
      try {
        await page.screenshot({ path: options.screenshotPath, fullPage: false });
      } catch (e) { degraded.push('screenshot'); }
    }

    // Internal, opt-in: raw :root tokens + interactive-state styles → sidecar.
    if (options.teach) {
      try { (result as any)._teach = await extractTeach(page); }
      catch { (result as any)._teach = null; }
    }

    if (options.includeRawColors) {
      result.colors.rawColors = colors._raw || [];
    }

    if (options.discoverLinks) {
      try {
        result._discoveredLinks = await discoverLinks(page, page.url(), options.discoverLinks);
      } catch {
        result._discoveredLinks = [];
      }
    }

    if (degraded.length) result.meta.degraded = degraded;

    return result;
  } catch (error) {
    spinner.fail("Extraction failed");
    console.error(`  ↳ Error during extraction: ${error.message}`);
    console.error(`  ↳ URL: ${url}`);
    console.error(`  ↳ Stage: ${spinner.text || "unknown"}`);
    throw error;
  }
}
