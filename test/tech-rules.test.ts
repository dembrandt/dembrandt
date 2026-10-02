import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectAll } from '../lib/tech/index.js';
import { emptySignals, type TechSignals } from '../lib/tech/signals.js';

type Patch = Partial<TechSignals>;
interface Case { name: string; version?: string; hit: Patch; miss: Patch }

const read = (patch: Patch) => detectAll({ ...emptySignals(), ...patch });
const tailwind: Patch = { cssVars: { '--tw-': 30 } };

/** One marker the technology leaves, and the nearest thing that is not it. */
const CASES: Case[] = [
  { name: 'React', version: '19.1.0', hit: { globals: { 'renderer:react-dom': '19.1.0' } }, miss: { globals: { ReactNativeWebView: '' } } },
  { name: 'React', version: '17', hit: { props: ['__reactFiber$', '__reactEvents$', '_reactRootContainer'] }, miss: { props: ['__reactive', '_react'] } },
  { name: 'React', version: '16', hit: { props: ['_reactRootContainer', '__reactInternalInstance$'] }, miss: { attrs: { 'data-react': 2 } } },
  { name: 'Preact', version: '10', hit: { props: ['__k', 'l'] }, miss: { props: ['__k', '__reactFiber$'] } },
  { name: 'Preact', version: '11', hit: { props: ['__k', '__e'] }, miss: { props: ['l', '__e'] } },
  { name: 'Vue', version: '3.5.13', hit: { props: ['__vue_app__'], globals: { 'dom:vue': '3.5.13' } }, miss: { attrs: { 'data-v-1a2b3c4d': 6 } } },
  { name: 'Vue', version: '2', hit: { props: ['__vue__'] }, miss: { props: ['__vueuse'] } },
  { name: 'Angular', version: '17.3.0', hit: { attrs: { 'ng-version': 1 }, attrValues: { 'ng-version': ['17.3.0'] } }, miss: { classes: { 'ng-pristine': 2, 'ng-valid': 2 } } },
  { name: 'AngularJS', version: '1.8.3', hit: { globals: { angular: '1.8.3' }, classes: { 'ng-scope': 4 } }, miss: { classes: { 'ng-star-inserted': 9 } } },
  { name: 'Svelte', version: '5', hit: { globals: { __svelte: '5' } }, miss: { classes: { svelte: 2, 'svelte-kit': 1 } } },
  { name: 'Alpine.js', version: '3', hit: { attrs: { 'x-data': 2 }, props: ['_x_dataStack'] }, miss: { attrs: { 'x-ms-format': 1 } } },
  { name: 'htmx', hit: { attrs: { 'hx-get': 3 } }, miss: { attrs: { 'hx-id': 3 } } },
  { name: 'Stimulus', hit: { attrs: { 'data-controller': 2, 'data-action': 2 }, attrValues: { 'data-action': ['click->menu#toggle'] } }, miss: { attrs: { 'data-controller': 2, 'data-action': 2 }, attrValues: { 'data-action': ['open'] } } },
  { name: 'Lit', version: '3', hit: { globals: { litHtmlVersions: '3.2.1', litElementVersions: '4.1.1' } }, miss: { globals: { lit: '' } } },
  { name: 'jQuery', version: '3.7.1', hit: { globals: { jQuery: '3.7.1' } }, miss: { globals: { jQueryMigrate: '' } } },
  { name: 'jQuery', version: '2', hit: { props: ['jQuery224'] }, miss: { props: ['jQueryish'] } },
  { name: 'jQuery', version: '1.11.3', hit: { banners: ['jQuery JavaScript Library v1.11.3'] }, miss: { banners: ['jQuery Migrate v3.4.1', 'jQuery Easing v1.4.1'] } },
  { name: 'Next.js', version: '15.3.2', hit: { globals: { next: '15.3.2' } }, miss: { ids: ['__next'] } },
  { name: 'Nuxt', version: '3.15.4', hit: { globals: { 'dom:nuxt': '3.15.4', useNuxtApp: '' } }, miss: { ids: ['__nuxt'] } },
  { name: 'SvelteKit', hit: { attrs: { 'data-sveltekit-preload-data': 1 } }, miss: { attrs: { 'data-svelte': 1 } } },
  { name: 'Astro', version: '5.1.0', hit: { generators: ['Astro v5.1.0'] }, miss: { generators: ['Astrology Theme 2.0'] } },
  { name: 'Gatsby', version: '5.14.1', hit: { generators: ['Gatsby 5.14.1'], ids: ['___gatsby'] }, miss: { ids: ['gatsby'] } },
  { name: 'Tailwind CSS', version: '3.4.17', hit: { banners: ['tailwindcss v3.4.17 | MIT License | https://tailwindcss.com'] }, miss: { classes: { 'p-4': 2 } } },
  { name: 'Bootstrap', version: '5.3', hit: { cssVars: { '--bs-': 400 }, cssVarNames: ['--bs-tertiary-bg', '--bs-border-radius'] }, miss: { cssVars: { '--bs-': 2 } } },
  { name: 'Bootstrap', version: '4', hit: { cssVars: { '--breakpoint-': 5, '--blue': 1 } }, miss: { cssVars: { '--blue': 1 } } },
  { name: 'Bootstrap', version: '3.3.7', hit: { banners: ['Bootstrap v3.3.7 (http://getbootstrap.com)'] }, miss: { banners: ['Bootstrap Icons v1.11.3', 'Bootstrap Table v1.22.0'] } },
  { name: 'Bootstrap', version: '5.3.3', hit: { resources: ['https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css'] }, miss: { resources: ['https://site.test/js/bootstrap-app.js', 'https://site.test/app/bootstrap.json'] } },
  { name: 'Foundation', hit: { resources: ['https://site.test/css/foundation.min.css'] }, miss: { resources: ['https://site.test/data/the-foundation.json', 'https://site.test/img/foundation.svg'] } },
  { name: 'Bulma', version: '1', hit: { cssVars: { '--bulma-': 900 } }, miss: { classes: { columns: 1, 'is-active': 3 } } },
  { name: 'UIkit', version: '3.21.6', hit: { globals: { UIkit: '3.21.6' }, classes: { 'uk-button': 2, 'uk-card': 1 } }, miss: { classes: { 'uk-flag': 1, ukraine: 2 } } },
  { name: 'Fomantic UI', version: '2.9.4', hit: { banners: ['Fomantic UI - 2.9.4'] }, miss: { banners: ['Semantic Release 2.9.4'] } },
  { name: 'Material UI (MUI)', hit: { classes: { 'MuiButton-root': 2, 'MuiPaper-elevation1': 2 } }, miss: { classes: { Music: 2, 'Mui': 3 } } },
  { name: 'Chakra UI', hit: { cssVars: { '--chakra-': 300 } }, miss: { classes: { 'chakra': 1 } } },
  { name: 'Ant Design', hit: { classes: { 'ant-btn': 2, 'ant-card': 1 } }, miss: { classes: { 'ant-': 1, antelope: 3 } } },
  { name: 'Mantine', hit: { cssVars: { '--mantine-': 400 } }, miss: { classes: { mantine: 1 } } },
  { name: 'Radix UI', hit: { ids: ['radix-_r_1_'] }, miss: { attrs: { 'data-state': 12 } } },
  { name: 'Headless UI', hit: { ids: ['headlessui-menu-button-1'] }, miss: { attrs: { 'aria-expanded': 4, 'aria-controls': 4 } } },
  { name: 'Base UI', hit: { ids: ['base-ui-_r_2_'] }, miss: { attrs: { 'data-orientation': 4 } } },
  { name: 'shadcn/ui', hit: { ...tailwind, cssVarNames: ['--muted-foreground', '--primary-foreground', '--popover', '--ring'], attrValues: { 'data-slot': ['button', 'card'] } }, miss: { ...tailwind, attrs: { 'data-radix-collection-item': 4, 'data-state': 9 }, attrValues: { 'data-slot': ['label'] } } },
  { name: 'Fluent UI', version: '9', hit: { classes: { 'fui-Button': 2, 'fui-FluentProvider': 1 } }, miss: { classes: { 'ms-4': 6, 'items-center': 3 } } },
  { name: 'Carbon Design System', hit: { classes: { 'cds--btn': 2, 'cds--header': 1 } }, miss: { classes: { cds: 2, 'bx-shadow': 2 } } },
  { name: 'Shopify Polaris', hit: { classes: { 'Polaris-Button': 2, 'Polaris-Page': 1 } }, miss: { classes: { polaris: 4 } } },
  { name: 'Vuetify', version: '3.7.5', hit: { globals: { Vuetify: '3.7.5' } }, miss: { classes: { 'v-if': 1, 'v-btn': 1 } } },
  { name: 'Element Plus/UI', hit: { cssVars: { '--el-': 900 } }, miss: { classes: { 'el-': 2, elegant: 4 } } },
  { name: 'styled-components', version: '6.1.13', hit: { attrs: { 'data-styled': 1, 'data-styled-version': 1 }, attrValues: { 'data-styled-version': ['6.1.13'] } }, miss: { classes: { 'sc-abc': 4 } } },
  { name: 'Emotion', hit: { attrs: { 'data-emotion': 2 } }, miss: { classes: { 'css-1abc': 4 } } },
  { name: 'Shoelace', hit: { tags: { 'sl-button': 2 } }, miss: { tags: { 'sl-doc-search': 4 }, cssVars: { '--sl-': 90 } } },
  { name: 'Slick', hit: { classes: { 'slick-slider': 1, 'slick-initialized': 1 } }, miss: { classes: { slick: 2, 'slick-ui': 1 } } },
  { name: 'Swiper', version: '11.1.4', hit: { banners: ['Swiper 11.1.4'], classes: { 'swiper-wrapper': 1, 'swiper-slide': 4 } }, miss: { classes: { swiper: 1 } } },
  { name: 'Select2', version: '4.0.13', hit: { banners: ['Select2 4.0.13 | https://github.com/select2/select2'] }, miss: { classes: { select2: 1 } } },
  { name: 'DataTables', version: '1.13.11', hit: { globals: { DataTable: '1.13.11' } }, miss: { classes: { 'data-table': 2 } } },
  { name: 'Font Awesome', version: '6.5.1', hit: { classes: { 'fa-solid': 3, 'fa-star': 2 }, banners: ['Font Awesome Free 6.5.1 by @fontawesome'] }, miss: { classes: { fab: 1, 'fa-': 1, fancy: 2 } } },
  { name: 'Font Awesome', version: '3', hit: { fontFaces: ['FontAwesome'], classes: { 'icon-star': 2 } }, miss: { fontFaces: ['icons'], classes: { 'icon-star': 2 } } },
  { name: 'Lucide', hit: { classes: { lucide: 5, 'lucide-star': 2 } }, miss: { classes: { lucid: 5 } } },
  { name: 'Heroicons', hit: { attrs: { 'data-slot': 4 }, attrValues: { 'data-slot': ['icon'] } }, miss: { attrs: { 'data-slot': 4 }, attrValues: { 'data-slot': ['icon'] }, classes: { lucide: 4, 'lucide-star': 4 } } },
  { name: 'Material Icons', hit: { classes: { 'material-icons': 6 } }, miss: { classes: { material: 2, icons: 2 } } },
  { name: 'Bootstrap Icons', hit: { classes: { bi: 5, 'bi-star': 2 } }, miss: { classes: { bi: 5 } } },
  { name: 'Phosphor Icons', hit: { svgs: { '0 0 256 256||currentColor|': 6 } }, miss: { svgs: { '0 0 256 256||currentColor|': 2 } } },
  { name: 'WordPress', version: '6.5.2', hit: { generators: ['WordPress 6.5.2'] }, miss: { resources: ['https://site.test/blog/wp.css'] } },
  { name: 'Webflow', hit: { attrs: { 'data-wf-site': 1 } }, miss: { classes: { 'w-nav': 1 } } },
  { name: 'Shopify', hit: { globals: { Shopify: '' } }, miss: { classes: { shop: 2 } } },
];

for (const { name, version, hit, miss } of CASES) {
  test(`${name}${version ? ` ${version}` : ''}: named on its marker, not on the near miss`, () => {
    const found = read(hit).find((tech) => tech.name === name);
    assert.ok(found, `${name} not detected`);
    if (version) assert.equal(found.version, version);
    assert.ok(!read(miss).some((tech) => tech.name === name), `${name} detected on the near miss`);
  });
}

test('every case reports only what its marker supports', () => {
  for (const { name, hit } of CASES) {
    const others = read(hit).map((tech) => tech.name).filter((n) => n !== name && n !== 'Tailwind CSS');
    assert.deepEqual(others, [], `${name}'s marker also named ${others.join(', ')}`);
  }
});
