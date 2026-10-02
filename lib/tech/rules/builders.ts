import { all, attr, cls, generator, generatorVersion, glob, id, resource, tag, type TechRule } from '../model.js';

export const BUILDER_RULES: TechRule[] = [
  {
    name: 'VitePress', category: 'meta-framework',
    strong: [generator(/^VitePress/), glob('__VP_HASH_MAP__'), all(cls(/^VP(Nav|Content|Doc|Home)/), id('VPContent'))],
    version: [generatorVersion(/^VitePress v?([\d.]+)/)],
  },
  {
    name: 'Starlight', category: 'meta-framework',
    strong: [generator(/^Starlight v\d/), tag(/^starlight-[a-z]/)],
    version: [generatorVersion(/^Starlight v([\d.]+)/)],
  },
  {
    name: 'Docusaurus', category: 'meta-framework',
    strong: [generator(/^Docusaurus/), id('__docusaurus'), glob('docusaurus')],
    version: [generatorVersion(/^Docusaurus v?([\d.]+)/)],
  },
  {
    name: 'WordPress', category: 'site-builder',
    strong: [generator(/^WordPress/), resource(/\/wp-(content|includes)\//), glob('wp')],
    version: [generatorVersion(/^WordPress ([\d.]+)/)],
  },
  {
    name: 'Elementor', category: 'site-builder',
    strong: [cls(/^elementor(-|$)/, 3), generator(/^Elementor/), glob('elementorFrontend')],
    version: [generatorVersion(/^Elementor ([\d.]+)/)],
  },
  {
    name: 'Webflow', category: 'site-builder',
    strong: [attr('data-wf-site'), attr('data-wf-page'), generator(/^Webflow/), glob('Webflow')],
  },
  {
    name: 'Wix', category: 'site-builder',
    strong: [generator(/^Wix\.com/), glob('wixBiSession'), resource(/static\.parastorage\.com|static\.wixstatic\.com/)],
  },
  {
    name: 'Squarespace', category: 'site-builder',
    strong: [glob('Squarespace'), resource(/static1?\.squarespace\.com|assets\.squarespace\.com/), cls(/^sqs-/, 3)],
  },
  {
    name: 'Shopify', category: 'site-builder',
    strong: [glob('Shopify'), resource(/cdn\.shopify\.com|\/cdn\/shop\//), cls(/^shopify-section/)],
  },
  {
    name: 'Framer', category: 'site-builder',
    strong: [attr('data-framer-name'), attr('data-framer-component-type'), generator(/^Framer/), resource(/framerusercontent\.com/)],
  },
  {
    name: 'Drupal', category: 'site-builder',
    strong: [generator(/^Drupal/), glob('drupalSettings'), attr('data-drupal-selector'), resource(/\/sites\/default\/files\//)],
    version: [generatorVersion(/^Drupal (\d+)/)],
  },
  {
    name: 'Ghost', category: 'site-builder',
    strong: [generator(/^Ghost/)],
    version: [generatorVersion(/^Ghost ([\d.]+)/)],
  },
  {
    name: 'Hugo', category: 'site-builder',
    strong: [generator(/^Hugo/)],
    version: [generatorVersion(/^Hugo ([\d.]+)/)],
  },
  {
    name: 'Jekyll', category: 'site-builder',
    strong: [generator(/^Jekyll/)],
    version: [generatorVersion(/^Jekyll v?([\d.]+)/)],
  },
  {
    name: 'Eleventy', category: 'site-builder',
    strong: [generator(/^Eleventy/)],
    version: [generatorVersion(/^Eleventy v?([\d.]+)/)],
  },
];
