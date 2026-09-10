/** The name a site addresses us by. Only applies when we send it (see `agent`). */
export const ROBOTS_AGENT = "Dembrandt";

interface RobotsRule {
  type: "allow" | "disallow";
  value: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

const ABSENT_STATUSES = new Set([404, 410]);

export type RobotsResult =
  | { status: "absent"; robotsUrl: string }
  | { status: "unavailable"; robotsUrl: string }
  | { status: "ok"; robotsUrl: string; allowed: boolean; rule: string | null };

export type RobotsRules =
  | { status: "absent" }
  | { status: "unavailable" }
  | { status: "ok"; robotsUrl: string; rules: RobotsRule[]; sitemaps: string[] };

/**
 * Fetch and parse robots.txt for the target's origin once, so a multi-page
 * crawl can check every discovered URL against it without one request per page.
 */
export async function fetchRobotsRules(
  targetUrl: string,
  { timeoutMs = 5000, agent = "*" }: { timeoutMs?: number; agent?: string } = {},
): Promise<RobotsRules> {
  const u = new URL(targetUrl);
  const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let body: string;
  try {
    const res = await fetch(robotsUrl, {
      signal: controller.signal,
      headers: { "User-Agent": ROBOTS_AGENT },
    });
    if (ABSENT_STATUSES.has(res.status)) return { status: "absent" };
    if (!res.ok) return { status: "unavailable" };
    body = await res.text();
    // A bot wall answers 200 with HTML, which parses to no rules and would read
    // as "nothing disallowed" — the inversion of what the site is saying.
    if (looksLikeHtml(body)) return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }

  const groups = parseRobots(body);
  const rules = matchGroup(groups, agent) || matchGroup(groups, "*") || [];
  return { status: "ok", robotsUrl, rules, sitemaps: parseSitemapDirectives(body) };
}

export type RobotsVerdict =
  | { action: 'proceed' }
  | { action: 'warn'; reason: string; rule: string | null }
  | { action: 'refuse'; reason: string };

/**
 * What a run should do with a robots result. Enforcing runs refuse a disallow
 * and an unreadable robots.txt; a user-driven run is warned and proceeds,
 * because it is the user, not the tool, who knows what they may fetch.
 */
export function robotsVerdict(
  robots: RobotsResult,
  { enforce }: { enforce: boolean },
): RobotsVerdict {
  if (robots.status === 'absent') return { action: 'proceed' };
  if (robots.status === 'unavailable') {
    return enforce ? { action: 'refuse', reason: 'robots.txt could not be read' } : { action: 'proceed' };
  }
  if (robots.allowed) return { action: 'proceed' };

  const reason = `robots.txt disallows this path (rule: "${robots.rule}")`;
  return enforce ? { action: 'refuse', reason } : { action: 'warn', reason, rule: robots.rule };
}

/** A run that names itself can be allowed or refused by name in robots.txt. */
export function robotsAgentFor(userAgent: string | undefined): string {
  return userAgent && userAgent.toLowerCase().includes("dembrandt") ? ROBOTS_AGENT : "*";
}

export function evaluatePath(rules: RobotsRule[], path: string): { allowed: boolean; rule: string | null } {
  return evaluate(rules, path);
}

/** Evaluate a target against rules already fetched for its origin. */
export function checkAgainstRules(targetUrl: string, rules: RobotsRules): RobotsResult {
  const u = new URL(targetUrl);
  if (rules.status !== "ok") {
    return { status: rules.status, robotsUrl: `${u.protocol}//${u.host}/robots.txt` };
  }
  return { status: "ok", robotsUrl: rules.robotsUrl, ...evaluatePath(rules.rules, u.pathname || "/") };
}

export async function checkRobotsTxt(
  targetUrl: string,
  opts: { timeoutMs?: number; agent?: string } = {},
): Promise<RobotsResult> {
  return checkAgainstRules(targetUrl, await fetchRobotsRules(targetUrl, opts));
}

/**
 * Split discovered crawl URLs into those robots.txt allows and those it
 * doesn't, using an already-fetched rule set. Follows the same truth table as
 * robotsVerdict: an unreadable robots.txt allows everything through unless the
 * run enforces, and an absent one always does.
 */
export function filterAllowedUrls(
  urls: string[],
  robotsRules: RobotsRules,
  { enforce = false }: { enforce?: boolean } = {},
): { allowed: string[]; disallowed: { url: string; rule: string | null }[] } {
  if (robotsRules.status === "unavailable" && enforce) {
    return { allowed: [], disallowed: urls.map((url) => ({ url, rule: null })) };
  }
  if (robotsRules.status !== "ok") return { allowed: urls, disallowed: [] };
  const allowed: string[] = [];
  const disallowed: { url: string; rule: string | null }[] = [];
  for (const url of urls) {
    let path = "/";
    try {
      path = new URL(url).pathname || "/";
    } catch {
      allowed.push(url);
      continue;
    }
    const decision = evaluatePath(robotsRules.rules, path);
    if (decision.allowed) allowed.push(url);
    else disallowed.push({ url, rule: decision.rule });
  }
  return { allowed, disallowed };
}

function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      if (!current) {
        current = { agents: ["*"], rules: [] };
        groups.push(current);
      }
      current.rules.push({ type: field, value });
      lastWasAgent = false;
    }
  }
  return groups;
}

/** `Sitemap:` directives are global, not scoped to a user-agent group. */
function parseSitemapDirectives(body: string): string[] {
  return [...body.matchAll(/^\s*sitemap:\s*(\S+)/gim)]
    .map(m => m[1].trim())
    .filter(u => /^https?:\/\//i.test(u));
}

function looksLikeHtml(body: string): boolean {
  return /^\s*(<!doctype html|<html|<head|<body)/i.test(body);
}

function matchGroup(groups: RobotsGroup[], agent: string): RobotsRule[] | null {
  const wanted = agent.toLowerCase();
  for (const g of groups) {
    if (g.agents.includes(wanted)) return g.rules;
  }
  return null;
}

function evaluate(rules: RobotsRule[], path: string): { allowed: boolean; rule: string | null } {
  let best: { type: "allow" | "disallow" | null; length: number; value: string } = {
    type: null,
    length: -1,
    value: "",
  };
  for (const r of rules) {
    if (!r.value) continue;
    if (!pathMatches(path, r.value)) continue;
    if (r.value.length > best.length) best = { ...r, length: r.value.length };
  }
  if (best.type === "disallow") return { allowed: false, rule: best.value };
  return { allowed: true, rule: best.value || null };
}

function pathMatches(path: string, pattern: string): boolean {
  const anchored = pattern.endsWith("$");
  const p = anchored ? pattern.slice(0, -1) : pattern;
  const parts = p.split("*");
  let i = 0;
  for (let k = 0; k < parts.length; k++) {
    const seg = parts[k];
    if (k === 0) {
      if (!path.startsWith(seg)) return false;
      i = seg.length;
    } else {
      const found = path.indexOf(seg, i);
      if (found === -1) return false;
      i = found + seg.length;
    }
  }
  if (anchored && i !== path.length) return false;
  return true;
}
