import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectFrameworks } from '../lib/extractors/breakpoints.js';

function fakePage(html: string, counts: Record<string, number>) {
  const document = {
    documentElement: { outerHTML: html },
    body: { classList: { contains: () => false }, hasAttribute: () => false },
    querySelectorAll: (selector: string) => {
      const n = Object.entries(counts).find(([k]) => selector.includes(k))?.[1] ?? 0;
      return Array.from({ length: n }, () => ({ href: '', src: '' }));
    },
  };
  return {
    evaluate: async (fn: () => unknown) => {
      const g = globalThis as { document?: unknown };
      const prev = g.document;
      g.document = document;
      try { return fn(); } finally { g.document = prev; }
    },
  };
}

const tailwindHtml = '<div class="top-[117px] md:flex hover:bg-red-500"></div>';

test('accessible toggles alone are not Headless UI', async () => {
  const page = fakePage(tailwindHtml, { '[aria-controls][aria-expanded]': 6 });
  const names = (await detectFrameworks(page)).map((f: { name: string }) => f.name);
  assert.ok(names.includes('Tailwind CSS'));
  assert.ok(!names.includes('Headless UI'));
});

test('Headless UI is detected by its own state attribute', async () => {
  const page = fakePage('<div></div>', { '[data-headlessui-state]': 2 });
  const names = (await detectFrameworks(page)).map((f: { name: string }) => f.name);
  assert.ok(names.includes('Headless UI'));
});
