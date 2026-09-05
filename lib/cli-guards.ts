/**
 * Flag-combination guards: pure predicates over parsed CLI options, so the
 * "this flag did nothing" warnings are testable without launching a browser.
 */

export interface GuardOptions {
  approve?: boolean;
  compare?: string;
  crawl?: number | null;
  sitemap?: boolean;
  colorFormat?: string;
  voice?: boolean;
  saveOutput?: boolean;
  dtcg?: boolean;
  jsonOnly?: boolean;
  designMd?: boolean;
  tailwind?: string | boolean;
  html?: string | boolean;
  brandGuide?: boolean;
}

/** Voice never reaches the terminal — no formatter prints it — so a lone --voice needs a JSON sink. */
export function voiceNeedsOutputFile(opts: GuardOptions, hasApiKey: boolean): boolean {
  return !!opts.voice && !opts.saveOutput && !opts.dtcg && !opts.jsonOnly && !hasApiKey;
}

/** Explicit paths are the page list, so discovery flags passed alongside them never run. */
export function ignoredDiscoveryWarning(opts: GuardOptions, paths: string[] | undefined): string | null {
  const count = paths?.length ?? 0;
  if (!count) return null;
  const ignored = [opts.crawl && "--crawl", opts.sitemap && "--sitemap"].filter(Boolean) as string[];
  if (!ignored.length) return null;
  const verb = ignored.length > 1 ? "are" : "is";
  return `! ${ignored.join(" and ")} ${verb} ignored when paths are listed: extracting the ${count} given path${count === 1 ? "" : "s"}. Drop the paths to discover pages instead.`;
}

/** --color-format shapes the terminal column only; every export path keeps its own encoding. */
export function colorFormatWarning(opts: GuardOptions): string | null {
  if (!opts.colorFormat || opts.colorFormat === "hex") return null;
  const unaffected = [
    opts.jsonOnly && "--json-only",
    opts.saveOutput && "--save-output",
    opts.dtcg && "--dtcg",
    opts.designMd && "--design-md",
    opts.tailwind && "--tailwind",
    opts.html && "--html",
    opts.brandGuide && "--brand-guide",
  ].filter(Boolean) as string[];
  if (!unaffected.length) return null;
  return `! --color-format=${opts.colorFormat} applies to terminal output only; ${unaffected.join(", ")} ${unaffected.length > 1 ? "are" : "is"} unaffected. JSON carries hex, rgb, lch and oklch for every colour.`;
}

/** --approve only means something against a local baseline file. */
export function approveWarning(opts: GuardOptions): string | null {
  return opts.approve && !opts.compare ? "! --approve has no effect without --compare <file>." : null;
}

/** Every guard warning for a run, in the order they are emitted. */
export function guardWarnings(opts: GuardOptions, paths: string[] | undefined): string[] {
  return [approveWarning(opts), ignoredDiscoveryWarning(opts, paths), colorFormatWarning(opts)].filter(
    (w): w is string => w !== null,
  );
}
