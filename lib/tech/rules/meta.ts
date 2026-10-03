import { all, any, attr, attrVersion, bannerVersion, cls, codeVersion, expandoVersion, generator, generatorVersion, glob, globalVersion, id, not, prop, resource, tag, versioned, when, type TechRule } from '../model.js';

export const META_RULES: TechRule[] = [
  {
    name: 'Angular', category: 'js-framework',
    strong: [attr('ng-version'), prop('__ngContext__'), attr(/^_ng(content|host)-/)],
    mount: { selector: '[ng-version]' },
    version: [attrVersion('ng-version')],
  },
  {
    name: 'Next.js', category: 'meta-framework',
    strong: [versioned('next'), id('__NEXT_DATA__'), glob('__next_f'), resource(/\/_next\/static\//), tag('next-route-announcer')],
    weak: [id('__next')],
    version: [globalVersion('next')],
  },
  {
    name: 'Nuxt', category: 'meta-framework',
    strong: [glob(/^(__NUXT__|\$nuxt|useNuxtApp)$/), id('__NUXT_DATA__'), all(id('__nuxt'), resource(/\/_nuxt\//))],
    weak: [id('__nuxt'), resource(/\/_nuxt\//)],
    version: [
      expandoVersion('dom:nuxt', '__vue_app__', '$nuxt.versions.nuxt'), codeVersion('nuxt', /versions:\{get nuxt\(\)\{return[`"'](\d+\.\d+\.\d+)[`"']\}/),
      when(any(id('__layout'), glob('$nuxt')), '2'), when(all(glob('__NUXT__'), prop('__vue_app__')), '3'),
    ],
  },
  {
    name: 'SvelteKit', category: 'meta-framework',
    strong: [glob('__sveltekit_'), attr(/^data-sveltekit-/), resource(/\/_app\/immutable\//)],
  },
  {
    name: 'Astro', category: 'meta-framework',
    strong: [generator(/^Astro v\d/), tag('astro-island'), attr(/^data-astro-cid-/), cls(/^astro-[A-Z0-9]{8}$/), all(resource(/\/_astro\//), not(glob('__NUXT__')))],
    version: [generatorVersion(/^Astro v([\d.]+)/)],
  },
  {
    name: 'Qwik', category: 'meta-framework',
    strong: [attr('q:container'), attr('q:version')],
    version: [attrVersion('q:version')],
  },
  {
    name: 'Remix', category: 'meta-framework',
    strong: [glob('__remixContext')],
    version: [bannerVersion(/^remix-run\/react v([\d.]+)/)],
  },
  {
    name: 'React Router', category: 'js-library',
    strong: [glob('__reactRouterVersion'), glob('__reactRouterContext')],
    version: [bannerVersion(/^(?:React Router|react-router) v([\d.]+)/), (s) => (/^\d+\.\d+/.test(s.globals.__reactRouterVersion ?? '') ? s.globals.__reactRouterVersion : undefined)],
  },
  {
    name: 'Gatsby', category: 'meta-framework',
    strong: [id('___gatsby'), glob('___loader'), generator(/^Gatsby \d/)],
    version: [generatorVersion(/^Gatsby ([\d.]+)/)],
  },
];
