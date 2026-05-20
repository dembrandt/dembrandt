import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateDesignMd } from '../lib/formatters/markdown.js';

test('generateDesignMd emits Google DESIGN.md front matter and ordered sections', () => {
  const output = generateDesignMd({
    url: 'https://example.com',
    siteName: 'Example Product',
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
    shadows: [],
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
  assert.match(output, /components:\n  button-observed:\n    backgroundColor: "\{colors.primary\}"/);
  assert.doesNotMatch(output, /## Do's and Don'ts/);

  const sectionOrder = [
    '## Overview',
    '## Colors',
    '## Typography',
    '## Layout',
    '## Elevation & Depth',
    '## Shapes',
    '## Components',
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
  assert.doesNotMatch(output, /\ncomponents:/);
  assert.doesNotMatch(output, /#000000|#FFFFFF|system-ui|16px|8px|button-observed/);
  assert.match(output, /without redesigning or correcting the source site/);
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
