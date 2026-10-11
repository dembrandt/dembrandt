import type { ConformanceReport, OffTokenValue } from '../token-conformance.js';

const CATEGORY_LABEL: Record<OffTokenValue['category'], string> = {
  color: 'Colour',
  radius: 'Radius',
  fontSize: 'Font size',
};

function cell(s: string | number | null): string {
  return String(s ?? '').replace(/\|/g, '\\|');
}

function distanceLabel(row: OffTokenValue): string {
  if (row.distance === null) return '';
  return row.category === 'color' ? `ΔE ${row.distance}` : `${row.distance}px`;
}

/**
 * A wiki page for one run: counts per category, then the off-token values with
 * their nearest token. Plain Markdown tables only, so it renders anywhere.
 */
export function generateConformanceMd(report: ConformanceReport, options: { version?: string; maxOffToken?: number } = {}): string {
  const total = report.offToken.length;
  const noun = `${total} off-token value${total === 1 ? '' : 's'}`;
  const verdict = options.maxOffToken === undefined
    ? noun
    : `${noun}, ${total > options.maxOffToken ? 'above' : 'within'} the limit of ${options.maxOffToken}`;

  const lines = [
    `# Rendered values against tokens`,
    ``,
    `${report.url} · ${report.checkedAt}${report.commit ? ` · ${report.commit.slice(0, 12)}` : ''}${options.version ? ` · dembrandt ${options.version}` : ''}`,
    ``,
    `**${verdict}.** Tokens read: ${report.tokens.color} colours, ${report.tokens.dimension} dimensions from ${report.tokenSources.join(', ')}.`,
    ``,
    `| Category | Rendered values | Off token |`,
    `|---|---|---|`,
    ...(['color', 'radius', 'fontSize'] as const).map((c) => `| ${CATEGORY_LABEL[c]} | ${report.categories[c].checked} | ${report.categories[c].offToken} |`),
    ``,
  ];

  if (total > 0) {
    lines.push(
      `## Off-token values`,
      ``,
      `| Category | Rendered | Seen | Nearest token | Distance |`,
      `|---|---|---|---|---|`,
      ...report.offToken.map((r) =>
        `| ${CATEGORY_LABEL[r.category]} | \`${cell(r.value)}\` | ${r.count} | ${r.nearest ? `\`${cell(r.nearest.name)}\` (${cell(r.nearest.value)})` : 'none'} | ${distanceLabel(r)} |`),
      ``,
    );
  }
  return lines.join('\n');
}
