/**
 * GitHub Actions workflow-command annotations for the drift gate (DEM-83).
 *
 * When `dembrandt --compare` runs inside GitHub Actions and detects drift, emit
 * `::error::`/`::warning::` workflow commands so the failure renders inline on
 * the PR's Checks tab instead of being buried in log text. The status check
 * (pass/fail) is already carried by the process exit code (EXIT.DRIFT), so this
 * module only adds the inline annotations.
 *
 * Severity maps from the drift change kind: a baseline token that drifted
 * (`changed`) or vanished (`removed`) is a violation against the brand baseline
 * -> error; a token that newly appeared (`added`) is review-worthy but not
 * itself a breach -> warning. This mirrors the example in the ticket ("color is
 * off-palette" -> error, "new colours appeared" -> warning).
 *
 * Not yet wired: `file=`/`line=` source locations (needs the drift source-scan,
 * DEM-33) and assertion-driven severity (DEM-81). Both become extra inputs here
 * without changing the command syntax below.
 */

import type { DriftReport, DriftChange } from "./drift.js";

/** GitHub Actions sets GITHUB_ACTIONS=true on every step. Only there do workflow
 * commands render; emitting them anywhere else is noise. */
export function isGitHubActions(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GITHUB_ACTIONS === "true";
}

// Workflow-command escaping (per actions/toolkit). Message data and property
// values escape different character sets; applying the wrong one lets a value
// containing a comma or newline corrupt the command.
function escapeData(s: string): string {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeProperty(s: string): string {
  return s
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

type Severity = "error" | "warning";

function severityForKind(kind: DriftChange["kind"]): Severity {
  return kind === "added" ? "warning" : "error";
}

function changeMessage(c: DriftChange): string {
  const move =
    c.before && c.after ? ` ${c.before} -> ${c.after}`
    : c.before ? ` ${c.before} removed`
    : c.after ? ` ${c.after} new`
    : "";
  const delta = typeof c.delta === "number" ? `, delta ${Math.round(c.delta * 10) / 10}` : "";
  return `${c.label}${move} (token-drift:${c.category}${delta})`;
}

/**
 * Build the workflow-command lines for a failing drift report. Pure: returns the
 * lines; the caller prints them to stdout (workflow commands are read from
 * stdout). Returns an empty array for a stable report.
 */
export function driftAnnotations(report: DriftReport): string[] {
  if (report.status !== "drift") return [];
  const lines: string[] = [];
  const title = `Design drift ${report.score} exceeds threshold ${report.threshold}`;
  const summary = `${report.summary.changed} changed, ${report.summary.added} added, ${report.summary.removed} removed`;
  lines.push(`::error title=${escapeProperty(title)}::${escapeData(summary)}`);
  for (const c of report.changes) {
    lines.push(`::${severityForKind(c.kind)}::${escapeData(changeMessage(c))}`);
  }
  return lines;
}

/**
 * Emit drift annotations to stdout when running under GitHub Actions. No-op
 * otherwise (plain CLI output already covers local runs). `log`/`env` are
 * injectable for tests.
 */
export function emitDriftAnnotations(
  report: DriftReport,
  log: (line: string) => void = console.log,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isGitHubActions(env)) return;
  for (const line of driftAnnotations(report)) log(line);
}
