const UA = "Dembrandt";

interface RobotsRule {
  type: "allow" | "disallow";
  value: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export type RobotsResult =
  | { status: "unavailable"; robotsUrl: string }
  | { status: "ok"; robotsUrl: string; allowed: boolean; rule: string | null };

export async function checkRobotsTxt(
  targetUrl: string,
  { timeoutMs = 5000 }: { timeoutMs?: number } = {},
): Promise<RobotsResult> {
  const u = new URL(targetUrl);
  const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
  const path = u.pathname || "/";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let body: string;
  try {
    const res = await fetch(robotsUrl, {
      signal: controller.signal,
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return { status: "unavailable", robotsUrl };
    body = await res.text();
  } catch {
    return { status: "unavailable", robotsUrl };
  } finally {
    clearTimeout(timer);
  }

  const groups = parseRobots(body);
  const rules = matchGroup(groups, UA) || matchGroup(groups, "*") || [];
  const decision = evaluate(rules, path);

  return { status: "ok", robotsUrl, ...decision };
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
