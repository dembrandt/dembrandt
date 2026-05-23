import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateDesignMd } from '../lib/formatters/markdown.js';

test('generateDesignMd emits Google DESIGN.md front matter and ordered sections', () => {
  const output = generateDesignMd({
    url: 'https://example.com',
    extractedAt: '2026-05-22T00:00:00.000Z',
    siteName: 'Example Product',
    logo: { url: 'https://example.com/logo.svg', type: 'wordmark' },
    favicons: [
      { type: 'icon', url: 'https://example.com/favicon-32.png', sizes: '32x32' },
      { type: 'og:image', url: 'https://example.com/og.png', sizes: null },
    ],
    colors: {
      semantic: {
        primary: 'rgb(26, 28, 30)',
      },
      palette: [
        { color: 'rgb(26, 28, 30)', confidence: 'high' },
        { color: 'rgb(108, 114, 120)', confidence: 'high' },
        { color: 'rgb(247, 245, 242)', confidence: 'medium' },
        { color: 'rgb(255, 255, 255)', confidence: 'medium' },
      ],
    },
    typography: {
      sources: { googleFonts: ['Public Sans'] },
      styles: [
        {
          fontFamily: 'Public Sans',
          fontSize: '48px',
          fontWeight: '600',
          lineHeight: '1.1',
          letterSpacing: '-0.02em',
          contexts: ['h1'],
        },
        {
          fontFamily: 'Public Sans',
          fontSize: '16px',
          fontWeight: '400',
          lineHeight: '24px',
          contexts: ['p'],
        },
      ],
    },
    spacing: {
      scaleType: '8px',
      commonValues: [
        { px: '4px' },
        { px: '8px' },
        { px: '16px' },
        { px: '24px' },
      ],
    },
    borderRadius: {
      values: [
        { value: '4px', confidence: 'high' },
        { value: '8px', confidence: 'high' },
        { value: '50%', confidence: 'medium' },
      ],
    },
    shadows: [
      { shadow: '0 1px 2px rgba(0, 0, 0, 0.1)', count: 10 },
      { shadow: '0 8px 24px rgba(0, 0, 0, 0.2)', count: 4 },
    ],
    borders: {
      combinations: [
        { width: '1px', style: 'solid', color: 'rgb(220, 220, 220)', count: 12 },
      ],
    },
    gradients: [
      { gradient: 'linear-gradient(90deg, rgb(0, 0, 0), rgb(255, 255, 255))', type: 'linear', count: 5 },
    ],
    motion: {
      durations: [
        { value: '150ms', ms: 150, count: 5 },
        { value: '300ms', ms: 300, count: 3 },
      ],
      easings: [
        { value: 'ease-out', type: 'ease-out', count: 8 },
        { value: 'cubic-bezier(0.34, 1.56, 0.64, 1)', type: 'spring', count: 2 },
      ],
    },
    breakpoints: [{ px: '768px' }, { px: '1024px' }],
    components: {
      buttons: [
        {
          backgroundColor: 'rgb(26, 28, 30)',
          color: 'rgb(255, 255, 255)',
          padding: '12px 16px',
          borderRadius: '8px',
        },
      ],
    },
  });

  assert.match(output, /^---\nname: "Example Product"\n/);
  assert.match(output, /colors:\n  primary: "#1A1C1E"/);
  assert.match(output, /typography:\n  headline-display:\n    fontFamily: "Public Sans"\n    fontSize: "48px"\n    fontWeight: 600\n    lineHeight: 1.1\n    letterSpacing: "-0.02em"/);
  assert.match(output, /spacing:\n  base: "8px"/);
  assert.match(output, /rounded:\n  sm: "4px"\n  md: "8px"\n  full: "9999px"/);
  assert.match(output, /elevation:\n  sm: "0 1px 2px rgba/);
  assert.match(output, /borders:\n  sm:\n    width: "1px"\n    style: "solid"\n    color: "#DCDCDC"/);
  assert.match(output, /gradients:\n  linear: "linear-gradient/);
  assert.match(output, /motion:\n  duration:\n    fast: "150ms"\n    base: "300ms"\n  easing:\n    ease-out: "ease-out"/);
  assert.match(output, /breakpoints:\n  sm: "768px"\n  md: "1024px"/);
  assert.match(output, /components:\n  button-observed:\n    backgroundColor: "\{colors.primary\}"/);
  assert.match(output, /assets:\n  logo: "https:\/\/example.com\/logo.svg"\n  favicon: "https:\/\/example.com\/favicon-32.png"\n  socialImage: "https:\/\/example.com\/og.png"/);
  assert.match(output, /meta:\n  source: "https:\/\/example.com"\n  extractedAt: "2026-05-22T00:00:00.000Z"\n  fontProvider: "Google Fonts \(Public Sans\)"/);
  assert.doesNotMatch(output, /## Do's and Don'ts/);

  const sectionOrder = [
    '## Overview',
    '## Colors',
    '## Typography',
    '## Layout',
    '## Elevation & Depth',
    '## Shapes',
    '## Gradients',
    '## Motion',
    '## Components',
    '## Assets',
  ];

  let previousIndex = -1;
  for (const section of sectionOrder) {
    const index = output.indexOf(section);
    assert.ok(index > previousIndex, `${section} should appear after the previous DESIGN.md section`);
    previousIndex = index;
  }
});

test('generateDesignMd does not invent token defaults when extraction data is absent', () => {
  const output = generateDesignMd({
    url: 'https://empty.example',
  });

  assert.match(output, /^---\nname: "empty.example"\n/);
  assert.doesNotMatch(output, /\ncolors:/);
  assert.doesNotMatch(output, /\ntypography:/);
  assert.doesNotMatch(output, /\nspacing:/);
  assert.doesNotMatch(output, /\nrounded:/);
  assert.doesNotMatch(output, /\nelevation:/);
  assert.doesNotMatch(output, /\nborders:/);
  assert.doesNotMatch(output, /\ngradients:/);
  assert.doesNotMatch(output, /\nmotion:/);
  assert.doesNotMatch(output, /\nbreakpoints:/);
  assert.doesNotMatch(output, /\ncomponents:/);
  assert.doesNotMatch(output, /\nassets:/);
  assert.doesNotMatch(output, /#000000|#FFFFFF|system-ui|16px|8px|button-observed/);
  assert.match(output, /without redesigning or correcting the source site/);
  assert.match(output, /\nmeta:\n  source: "https:\/\/empty.example"/);
});

test('generateDesignMd does not promote transparent colors to opaque tokens', () => {
  const output = generateDesignMd({
    url: 'https://transparent.example',
    colors: {
      semantic: {
        primary: 'rgba(0,0,0,0)',
      },
      palette: [
        { color: 'rgba(255,0,0,0)', confidence: 'high' },
        { color: '#33669900', confidence: 'high' },
        { color: 'rgb(10, 20, 30)', confidence: 'medium' },
      ],
    },
    components: {
      buttons: [
        {
          backgroundColor: 'rgba(0, 0, 0, 0)',
          color: 'rgb(255, 255, 255)',
        },
      ],
    },
  });

  assert.match(output, /colors:\n  primary: "#0A141E"/);
  assert.doesNotMatch(output, /#000000|#FF0000|#336699/);
  assert.doesNotMatch(output, /\ncomponents:/);
});

test('generateDesignMd omits hidden input borders and empty component sections', () => {
  const output = generateDesignMd({
    url: 'https://inputs.example',
    components: {
      inputs: {
        text: [
          {
            border: '0px none rgb(40, 40, 40)',
          },
        ],
      },
    },
  });

  assert.doesNotMatch(output, /0px none border/);
  assert.doesNotMatch(output, /\ncomponents:/);
  assert.doesNotMatch(output, /## Components/);
});
