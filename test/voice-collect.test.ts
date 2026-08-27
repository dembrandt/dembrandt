import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { collectVoice } from '../lib/voice/index.js';

// Assembly-level tests: budget, floor, page-type routing and the 404 probe.
// All served from an intercepted route, so nothing here touches the network.

const LEDE =
  'We help design teams keep the implemented product aligned with the brand they actually intend to ship every day.';

const body = (extra = ''): string => `
  <header><nav><a href="/product">Product</a><a href="/pricing">Pricing</a></nav></header>
  <section style="min-height:820px">
    <h1 style="font-size:48px">Extract any design system</h1>
    <p style="font-size:18px">Real computed values pulled from the rendered page rather than the stylesheet source of it.</p>
  </section>
  <main>
    <h2>Why teams choose us</h2><p>${LEDE}</p>
    <h2>Trusted by engineering teams</h2><p>The fastest way to audit a live interface, used by thousands of teams every month across the industry.</p>
    <h2>Built for continuous delivery</h2><p>We run against the rendered page, so the values you get are the ones your users actually see in their browser.</p>
    <h2>Works with your stack</h2><p>Export to design tokens, a Tailwind theme or a plain report, and wire the whole thing into your pipeline in an afternoon.</p>
    <blockquote>It replaced a week of manual DevTools work for our whole platform group here.</blockquote>
    <form><label for="e">Work email</label><input id="e" placeholder="you@company.com"></form>
    ${extra}
  </main>
  <footer><p>&copy; 2026 Example Oy. All rights reserved.</p></footer>`;

const page404 = `<!doctype html><html lang="en"><head><title>Not found</title></head>
  <body style="margin:0"><h1 style="font-size:40px">This page went missing</h1>
  <p style="font-size:16px">Nothing here. Try the homepage instead, everything else still works fine.</p></body></html>`;

const doc = (inner: string, lang = 'en'): string =>
  `<!doctype html><html lang="${lang}"><head><title>Example — design system extraction</title>` +
  `<meta name="description" content="Extract design tokens from any website in one command today."></head>` +
  `<body style="margin:0">${inner}</body></html>`;

let browser: Browser;
let context: BrowserContext;

/**
 * Serves the landing page at its own path and a 404 everywhere else. The route
 * is registered on the context, not the page: the probe opens its own page and
 * has to inherit it.
 */
async function open(url: string, html: string, opts: { with404?: boolean } = {}): Promise<Page> {
  await context.unrouteAll();
  await context.route('**/*', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const known = path === '/' || path === new URL(url).pathname;
    if (known) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    if (opts.with404 === false) return route.abort();
    return route.fulfill({ status: 404, contentType: 'text/html', body: page404 });
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}

before(async () => {
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
});

after(async () => {
  await browser?.close();
});

test('collects fragments, metrics and page type from a landing page', async () => {
  const page = await open('https://example.test/', doc(body()));
  const { voice, voiceSkipped } = await collectVoice(page, 'https://example.test/');

  assert.equal(voiceSkipped, undefined);
  assert.ok(voice);
  assert.equal(voice.pageType, 'landing');
  assert.ok(voice.fragments.length > 0);
  assert.ok(voice.metrics.structural.wordCount > 0);
  assert.equal(voice.metrics.lang, 'en');
  await page.close();
});

test('the 404 probe runs on its own page and leaves the caller untouched', async () => {
  const page = await open('https://example.test/', doc(body()));
  const before = page.url();

  const { voice } = await collectVoice(page, 'https://example.test/');

  // The probe used to navigate this page and restore it; anything running after
  // voice (wcag, the canvas-only check) then saw a differently-loaded page.
  assert.equal(page.url(), before);
  assert.ok(await page.$('h1'), 'the original DOM must still be there');

  const errorRoles = voice?.fragments.filter((f) => f.role.startsWith('error-404-')) ?? [];
  assert.ok(errorRoles.length > 0, 'probe copy should be collected');
  assert.match(errorRoles[0].text, /went missing|Nothing here/);
  await page.close();
});

test('a failing probe degrades to no 404 roles rather than failing the run', async () => {
  const page = await open('https://example.test/', doc(body()), { with404: false });
  const { voice } = await collectVoice(page, 'https://example.test/');

  assert.ok(voice, 'main-page fragments must survive a dead probe');
  assert.equal(voice.fragments.filter((f) => f.role.startsWith('error-404-')).length, 0);
  assert.equal(page.url(), 'https://example.test/');
  await page.close();
});

test('probe404: false skips the probe entirely', async () => {
  const page = await open('https://example.test/', doc(body()));
  const { voice } = await collectVoice(page, 'https://example.test/', { probe404: false });

  assert.ok(voice);
  assert.equal(voice.fragments.filter((f) => f.role.startsWith('error-404-')).length, 0);
  await page.close();
});

test('the probe path is stable across runs', async () => {
  // A random path changes the fragment on every 404 page that echoes the path
  // back, which would surface as drift on a site that never changed.
  const page = await open('https://example.test/', doc(body()));
  const a = await collectVoice(page, 'https://example.test/');
  const b = await collectVoice(page, 'https://example.test/');

  const only404 = (r: typeof a) =>
    (r.voice?.fragments ?? []).filter((f) => f.role.startsWith('error-404-')).map((f) => f.text);
  assert.deepEqual(only404(a), only404(b));
  await page.close();
});

test('a malformed url degrades to no probe rather than aborting collection', async () => {
  const page = await open('https://example.test/', doc(body()));
  // new URL() used to run outside the guard and took the whole run down with it.
  const { voice } = await collectVoice(page, 'not a url at all');

  assert.ok(voice, 'main-page fragments must survive');
  assert.equal(voice.fragments.filter((f) => f.role.startsWith('error-404-')).length, 0);
  await page.close();
});

test('a page under the word floor still returns fragments, flagged as low confidence', async () => {
  const page = await open('https://example.test/', doc('<h1>Hi</h1>'), { with404: false });
  const result = await collectVoice(page, 'https://example.test/');

  assert.ok(result.voice, 'thin pages must still yield whatever copy exists');
  assert.equal(result.voice.belowWordFloor, true);
  assert.equal(result.voiceSkipped, undefined);
  await page.close();
});

test('a page with no extractable text at all yields null plus a reason', async () => {
  const page = await open('https://example.test/', '<!doctype html><html><head></head><body></body></html>', {
    with404: false,
  });
  const result = await collectVoice(page, 'https://example.test/');

  assert.equal(result.voice, null);
  assert.equal(result.voiceSkipped, 'no-text');
  await page.close();
});

test('page type follows the path and changes the budget, not the roles attempted', async () => {
  const docsPage = await open('https://example.test/docs/intro', doc(body()));
  const { voice } = await collectVoice(docsPage, 'https://example.test/docs/intro', { probe404: false });

  assert.equal(voice?.pageType, 'docs');
  // Docs carry a lower cap, but the same roles are still collected.
  assert.ok(voice.fragments.some((f) => f.role === 'hero-h1'));
  await docsPage.close();
});

test('lexical metrics are withheld for a non-English document', async () => {
  const fi = `
    <section style="min-height:820px">
      <h1 style="font-size:48px">Poimi mika tahansa designjarjestelma</h1>
      <p style="font-size:18px">Todelliset lasketut arvot haetaan renderoidysta sivusta eika tyylitiedoston lahdekoodista.</p>
    </section>
    <main>
      <h2>Miksi tiimit valitsevat meidat</h2>
      <p>Autamme suunnittelutiimeja pitamaan toteutetun tuotteen linjassa sen brandin kanssa jonka ne aikovat julkaista, myos silloin kun tiimi kasvaa nopeasti ja alkuperainen ohjeistus alkaa jaada jalkeen arjesta.</p>
      <p>Nopein tapa auditoida elava kayttoliittyma, ja sita kayttaa tuhansia tiimeja joka kuukausi maailmalla, seka pienissa startupeissa etta suurissa organisaatioissa joilla on kymmenia rinnakkaisia palveluita.</p>
      <h2>Rakennettu jatkuvaan toimitukseen</h2>
      <p>Ajamme analyysin renderoityyn sivuun, joten saadut arvot ovat samoja jotka kayttaja nakee omassa selaimessaan, eika niita tarvitse enaa tarkistaa erikseen kehitystyokalujen kautta jokaisen julkaisun jalkeen.</p>
      <h2>Toimii teidan pinossanne</h2>
      <p>Vie tulokset design-tokeneiksi, Tailwind-teemaksi tai raportiksi ja kytke koko homma putkeen yhdessa iltapaivassa.</p>
      <h2>Selkea raportti jokaisesta ajosta</h2>
      <p>Jokainen ajo tuottaa saman rakenteisen tuloksen, joten kahden version vertailu kertoo tasmalleen mika muuttui ja missa kohtaa.</p>
      <h2>Ei arvailua vaan mitattuja arvoja</h2>
      <p>Emme lue tyylitiedostoja vaan katsomme mita selain oikeasti piirtaa, mukaan lukien hover- ja fokustilat jokaisesta komponentista.</p>
      <h2>Sopii isoillekin sivustoille</h2>
      <p>Voit ajaa yhden sivun tai kymmenen kerralla, ja tulokset yhdistetaan yhdeksi kokonaisuudeksi jossa toistuvat arvot saavat enemman painoa.</p>
      <h2>Avoin lahdekoodi ja selkeat rajapinnat</h2>
      <p>Koko tyokalu on avointa lahdekoodia, joten voit lukea tarkalleen miten jokainen arvo on paatelty ja korjata sen itse jos olet eri mielta.</p>
      <h2>Nopea ottaa kayttoon</h2>
      <p>Asennus vie yhden komennon eika vaadi tunnuksia, avaimia tai erillista palvelinta, joten kokeilu onnistuu heti ensimmaisella minuutilla.</p>
    </main>`;
  const page = await open('https://example.test/', doc(fi, 'fi'), { with404: false });
  const { voice } = await collectVoice(page, 'https://example.test/');

  assert.ok(voice);
  assert.equal(voice.metrics.lang, 'fi');
  // A zero would read as a measured absence rather than "not measured".
  assert.equal(voice.metrics.lexical, null);
  assert.ok(voice.metrics.structural.wordCount > 0);
  assert.ok(voice.metrics.structural.sentenceCount > 0);
  await page.close();
});

test('fragments never exceed the page type budget', async () => {
  const filler = Array.from({ length: 40 }, (_, i) => `<h2>Section ${i}</h2><p>${LEDE}</p>`).join('');
  const page = await open('https://example.test/', doc(body(filler)), { with404: false });
  const { voice } = await collectVoice(page, 'https://example.test/');

  assert.ok(voice);
  const words = voice.fragments.reduce((n, f) => n + f.text.trim().split(/\s+/).length, 0);
  assert.ok(words <= 800, `budget exceeded: ${words} words`);
  await page.close();
});
