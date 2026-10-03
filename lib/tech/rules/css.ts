import { all, any, asset, attr, attrValue, banner, bannerVersion, cls, codeVersion, cssVar, cssVarNamed, glob, globalVersion, layer, pathVersion, resource, resourceVersion, sheet, urlVersion, versioned, when, type TechRule } from '../model.js';

const PALETTE = '(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';

export const CSS_RULES: TechRule[] = [
  {
    name: 'Tailwind CSS', category: 'css-framework',
    strong: [banner(/^tailwindcss v\d/), cssVar('--tw-'), cssVarNamed('--bg-opacity'), sheet('text-grey-darkest', 'bg-blue-dark'), glob('tailwind'), resource(/cdn\.tailwindcss\.com/), asset('tailwind(?:css)?', 'css', 'tailwindcss|@tailwindcss/browser')],
    weak: [
      cls(/^-?[a-z][a-z-]*-\[[^\]]+\]$/),
      cls(/^(sm|md|lg|xl|2xl|dark|hover|focus|group-hover|peer-[a-z-]+):[a-z-]/),
      cls(new RegExp(`^(bg|text|border|ring)-${PALETTE}-(50|[1-9]00|950)$`)),
      cls(/^(p|m)[xytrbl]?-(\d+(\.5)?|px|auto)$/, 3),
    ],
    version: [
      bannerVersion(/^tailwindcss v([\d.]+)/),
      resourceVersion(/cdn\.tailwindcss\.com\/(\d+\.\d+\.\d+)/), urlVersion('(?:@tailwindcss/browser|tailwindcss)'),
      when(any(layer('theme', 'utilities'), cssVarNamed('--default-transition-duration'), all(cssVar('--tw-'), cssVar('@property'))), '4'),
      when(any(cssVarNamed('--tw-pan-x'), glob('tailwind')), '3'),
      when(cssVarNamed('--tw-ring-offset-shadow'), '2'),
      when(cssVarNamed('--bg-opacity'), '1'),
      when(sheet('text-grey-darkest', 'bg-blue-dark'), '0'),
    ],
  },
  {
    name: 'Bootstrap', category: 'css-framework',
    strong: [banner(/^Bootstrap v\d/),
      cssVar('--bs-', 5), all(cssVar('--breakpoint-'), cssVar('--blue')), attr(/^data-bs-(toggle|target|dismiss|theme)$/),
      asset('bootstrap', 'js|css', 'bootstrap|twitter-bootstrap'), versioned('bootstrap'),
      sheet('col-xs-12', 'btn-default'), sheet('row-fluid', 'navbar-inner'), sheet('navbar-toggler', 'btn-outline-primary'),
    ],
    weak: [
      all(cls(/^container(-fluid)?$/), cls('row'), cls(/^col-(xs|sm|md|lg|xl|xxl)-\d+$/)),
      all(cls('btn'), cls(/^btn-(primary|secondary|default|success|outline-[a-z]+)$/)),
      cls(/^navbar-(expand-[a-z]+|toggler|toggle|default)$/),
      attrValue('data-toggle', /^(collapse|dropdown|modal|tooltip|tab)$/),
    ],
    version: [
      bannerVersion(/^Bootstrap v([\d.]+)/),
      globalVersion('bootstrap'), pathVersion('jQuery.fn.tooltip.Constructor.VERSION'), urlVersion('(?:twitter-)?bootstrap'),
      when(cssVarNamed('--bs-tertiary-bg'), '5.3'), when(all(cssVarNamed('--bs-border-radius'), cssVar('--bs-')), '5.2'),
      when(any(cssVar('--bs-'), attr(/^data-bs-/)), '5'),
      when(any(cssVar('--breakpoint-'), sheet('navbar-toggler', 'btn-outline-primary')), '4'),
      when(any(sheet('col-xs-12', 'btn-default'), cls(/^col-xs-\d+$/)), '3'),
      when(sheet('row-fluid', 'navbar-inner'), '2'),
    ],
  },
  {
    name: 'Foundation', category: 'css-framework',
    strong: [glob('Foundation'), asset('foundation', 'js|css', 'foundation-sites|foundation'), sheet('top-bar', 'small-12', 'medium-6'), attr('data-foundation')],
    weak: [cls(/^(small|medium|large)-\d+$/), cls(/^(columns|cell)$/), cls(/^grid-[xy]$/), cls(/^(top-bar|callout|title-area)$/)],
    version: [codeVersion('foundation', /foundation-version\{font-family:"\/(\d+\.\d+\.\d+)\/"/), globalVersion('Foundation'), urlVersion('foundation(?:-sites)?'), when(any(sheet('callout', 'hollow'), cls('grid-x')), '6'), when(sheet('top-bar', 'small-12', 'medium-6'), '5')],
  },
  {
    name: 'Bulma', category: 'css-framework',
    strong: [banner(/^bulma\.io v\d/), cssVar('--bulma-', 5), asset('bulma', 'css'), sheet('is-primary', 'is-half', 'notification', 'columns')],
    weak: [all(cls('columns'), cls('column')), cls(/^is-(primary|link|info|success|warning|danger|light|dark)$/), cls(/^is-(half|one-third|one-quarter|large|medium|small|outlined|rounded|fullwidth)$/)],
    version: [bannerVersion(/^bulma\.io v([\d.]+)/), urlVersion('bulma'), when(cssVar('--bulma-'), '1'), when(sheet('is-primary', 'is-half', 'notification', 'columns'), '0')],
  },
  {
    name: 'Fomantic UI', category: 'css-framework',
    strong: [banner(/^Fomantic UI -? ?\d/), resource(/fomantic/), all(sheet('ui', 'segment', 'flyout'), cls('ui'))],
    version: [bannerVersion(/^Fomantic UI -? ?([\d.]+)/), urlVersion('fomantic-ui(?:-css)?')],
  },
  {
    name: 'Semantic UI', category: 'css-framework',
    strong: [banner(/^Semantic UI -? ?\d/), asset('semantic', 'js|css', 'semantic-ui(?:-css)?'), all(sheet('ui', 'segment', 'pusher'), cls('ui'))],
    version: [bannerVersion(/^Semantic UI -? ?([\d.]+)/), urlVersion('semantic-ui(?:-css)?')],
    yieldsTo: ['Fomantic UI'],
  },
  {
    name: 'UIkit', category: 'css-framework',
    strong: [banner(/^UIkit \d/), versioned('UIkit'), cssVar('--uk-'), cls(/^uk-/, 3), attr(/^(data-)?uk-[a-z]/), asset('uikit')],
    version: [bannerVersion(/^UIkit ([\d.]+)/), globalVersion('UIkit'), urlVersion('uikit'), when(any(cssVar('--uk-'), attr(/^uk-[a-z]/)), '3')],
  },
  {
    name: 'Materialize', category: 'css-framework',
    strong: [banner(/^Materialize v\d/), glob('Materialize'), all(versioned('M'), glob('Waves')), cls('waves-effect'), sheet('waves-effect', 'card-panel'), asset('materialize', 'js|css', 'materialize(?:-css)?')],
    version: [bannerVersion(/^Materialize v([\d.]+)/), globalVersion('M'), urlVersion('materialize(?:-css)?')],
  },
  {
    name: 'Pure.css', category: 'css-framework',
    strong: [banner(/^Pure v\d/), cls(/^pure-(g|g-r|u(-[\w-]+)?|button(-[a-z]+)?|menu(-[a-z]+)?|form(-[a-z]+)?|table(-[a-z]+)?)$/, 2), sheet('pure-g', 'pure-button'), asset('pure', 'css', 'pure(?:css)?')],
    version: [bannerVersion(/^Pure v([\d.]+)/), urlVersion('pure(?:css)?')],
  },
  {
    name: 'Tachyons', category: 'css-framework',
    strong: [banner(/^TACHYONS v\d/), sheet('b--light-gray', 'lh-title', 'mw7'), asset('tachyons', 'css')],
    weak: [cls(/^b--[a-z-]+$/), cls(/^(pa|ma|ph|pv|mh|mv|pt|pb|mt|mb)[0-7]$/, 2), cls(/^f[1-7]$/)],
    version: [bannerVersion(/^TACHYONS v([\d.]+)/), urlVersion('tachyons')],
  },
  {
    name: 'Pico CSS', category: 'css-framework',
    strong: [banner(/^Pico CSS .{0,4}v\d/), cssVar('--pico-', 5), all(cssVarNamed('--form-element-spacing-vertical'), cssVarNamed('--block-spacing-vertical')), asset('pico(?:\\.[a-z]+)*', 'css', '@picocss/pico')],
    version: [bannerVersion(/^Pico CSS .{0,4}v([\d.]+)/), urlVersion('(?:@picocss/)?pico'), when(cssVar('--pico-'), '2'), when(cssVarNamed('--form-element-spacing-vertical'), '1')],
  },
  {
    name: 'Spectre.css', category: 'css-framework',
    strong: [banner(/^Spectre\.css v\d/), sheet('toast-primary', 'navbar-section', 'col-md-12', 'chip'), asset('spectre', 'css', 'spectre\\.css')],
    version: [bannerVersion(/^Spectre\.css v([\d.]+)/), urlVersion('spectre(?:\\.css)?')],
  },
  {
    name: 'Milligram', category: 'css-framework',
    strong: [sheet('button-outline', 'button-clear', 'column-50'), asset('milligram', 'css')],
    version: [urlVersion('milligram')],
  },
  {
    name: 'Skeleton', category: 'css-framework',
    strong: [sheet('u-full-width', 'u-pull-right', 'button-primary'), resource(/\/ajax\/libs\/skeleton\/\d|\/skeleton(-css)?@\d/)],
    version: [urlVersion('skeleton(?:-css)?')],
  },
  {
    name: '960 Grid System', category: 'css-framework',
    strong: [all(cls(/^container_(12|16|24)$/), cls(/^grid_\d+$/)), sheet('container_12', 'grid_6'), asset('960(?:gs)?', 'css', '960gs')],
  },
  {
    name: 'Primer CSS', category: 'css-framework',
    strong: [sheet('Box-header', 'Header-item', 'Label--success'), asset('primer', 'css', '@primer/css')],
    weak: [cls(/^(Box|Header|Subhead|UnderlineNav|Label|Counter)(-|$)/, 2), cls(/^(Box|Header)-(header|body|item|link|title)$/)],
    version: [urlVersion('@primer/css')],
  },
  {
    name: 'Open Props', category: 'css-framework',
    strong: [all(cssVarNamed('--size-fluid-1'), cssVarNamed('--radius-blob-1')), asset('open-props', 'css')],
    version: [urlVersion('open-props')],
  },
  {
    name: 'DaisyUI', category: 'ui-library',
    strong: [cssVarNamed('--rounded-btn'), all(cssVarNamed('--color-base-100'), cssVarNamed('--color-primary-content')), asset('daisyui', 'css')],
    version: [urlVersion('daisyui'), when(all(cssVarNamed('--color-base-100'), cssVarNamed('--color-primary-content')), '5'), when(cssVar('--fallback-'), '4')],
  },
  {
    name: 'Flowbite', category: 'ui-library',
    strong: [glob('initFlowbite'), glob('FlowbiteInstances'), asset('flowbite')],
    weak: [attr(/^data-(modal|drawer)-(target|toggle|hide)$/), attr(/^data-(dropdown|collapse)-toggle$/), attr(/^data-(accordion|carousel|popover|tooltip)-(target|item|toggle)$/)],
    version: [urlVersion('flowbite')],
    requires: ['Tailwind CSS'],
  },
];

