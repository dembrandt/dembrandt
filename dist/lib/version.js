/**
 * Single source of truth for dembrandt output versioning.
 *
 * Three independent version axes travel with every extraction. Keeping them
 * separate is the whole point: a consumer (dembrandt-next, the MCP client, a
 * skill, the drift engine) must be able to reason about the *output format*
 * without coupling to which CLI release produced it.
 *
 *  - toolVersion   — the dembrandt CLI release (package.json version, e.g.
 *                    "0.16.0"). Surfaced as meta.dembrandtVersion. Changes on
 *                    every npm publish, including pure refactors.
 *  - schemaVersion — the dembrandt OUTPUT CONTRACT. Bumps only when the JSON
 *                    shape changes in a way a consumer must adapt to. A tool
 *                    release that does not change the shape leaves this alone.
 *  - specVersion   — the W3C DTCG spec revision the `--dtcg` export targets.
 *
 * Version info is surfaced through the two extraction chokepoints, so every
 * consumer inherits it without special-casing:
 *  - native JSON  : meta.schemaVersion (alongside meta.dembrandtVersion),
 *                   produced by extractBranding().
 *  - DTCG export  : $extensions["com.dembrandt"], produced by toDtcgTokens().
 *                   The DTCG spec mandates that tools preserve vendor extension
 *                   data they do not understand, so this block survives a
 *                   round-trip through any compliant tool.
 *
 * schemaVersion bump policy (semver over the output contract, not the tool):
 *  - PATCH : additive, non-semantic (a new optional field a consumer can ignore)
 *  - MINOR : additive but meaningful (a new field consumers will want to read)
 *  - MAJOR : removal, rename, or changed meaning of an existing field
 * Pre-1.0 the tool used loose semver; the output contract starts clean at 1.0.0,
 * baselined on the 0.16.0 shape (inline SVG logo fields, meta.degraded).
 */
// URL is a global in both the Node and DOM libs; no import needed.
/** dembrandt output contract version. Bump per the policy documented above. */
export const SCHEMA_VERSION = '1.0.0';
/** W3C DTCG spec revision the `--dtcg` export targets. */
export const DTCG_SPEC_VERSION = '2025.10';
/**
 * Reverse-domain key under which all dembrandt-specific data lives in DTCG
 * output. The DTCG spec recommends reverse-domain notation for $extensions keys
 * to avoid vendor clashes, and requires other tools to preserve unknown
 * extension data. This is the only sanctioned channel for proprietary data;
 * never invent custom `$`-prefixed keys or custom `$type` values.
 */
export const EXTENSION_KEY = 'com.dembrandt';
/**
 * Derive a clean domain from an extraction URL. Returns 'unknown' on failure so
 * the contract never throws while assembling metadata.
 */
function domainOf(url) {
    if (!url)
        return 'unknown';
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    }
    catch {
        return 'unknown';
    }
}
/**
 * Build the canonical `com.dembrandt` provenance block for DTCG `$extensions`.
 * Reads the tool version off the already-assembled native result so there is one
 * place (extractBranding's meta) that owns toolVersion.
 */
export function buildDembrandtProvenance(result = {}) {
    return {
        schemaVersion: SCHEMA_VERSION,
        toolVersion: result?.meta?.dembrandtVersion ?? null,
        specVersion: DTCG_SPEC_VERSION,
        generator: 'dembrandt',
        source: {
            url: result?.url ?? null,
            domain: domainOf(result?.url),
        },
        extractedAt: result?.extractedAt ?? null,
    };
}
/** Parse a semver-ish string into its numeric parts, or null if unparseable. */
function parseSemver(v) {
    if (!v)
        return null;
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
    if (!m)
        return null;
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}
/**
 * Compare an extraction's output-contract version against this build's
 * SCHEMA_VERSION. Never throws: malformed or missing version data degrades to
 * 'unknown' / 'legacy'. See SchemaCompatibility for the status semantics.
 */
export function checkSchemaCompatibility(result = {}) {
    const found = result?.meta?.schemaVersion ?? null;
    const toolVersion = result?.meta?.dembrandtVersion ?? null;
    const base = { found, expected: SCHEMA_VERSION, toolVersion };
    const foundParts = parseSemver(found);
    if (!foundParts) {
        if (toolVersion) {
            return {
                ...base,
                status: 'legacy',
                compatible: false,
                message: `Extraction predates the schema contract (produced by dembrandt v${toolVersion}, ` +
                    `no schemaVersion). Re-extract with the current release to validate against ` +
                    `schema ${SCHEMA_VERSION}. Reading best-effort.`,
            };
        }
        return {
            ...base,
            status: 'unknown',
            compatible: false,
            message: 'No version metadata on this extraction. Cannot verify schema compatibility; reading best-effort.',
        };
    }
    const expectedParts = parseSemver(SCHEMA_VERSION);
    if (foundParts.major === expectedParts.major) {
        const status = found === SCHEMA_VERSION ? 'current' : 'compatible';
        return { ...base, status, compatible: true, message: null };
    }
    if (foundParts.major < expectedParts.major) {
        return {
            ...base,
            status: 'outdated',
            compatible: false,
            message: `Extraction uses schema ${found}, this build expects ${SCHEMA_VERSION} ` +
                `(breaking change between majors). Re-extract recommended.`,
        };
    }
    return {
        ...base,
        status: 'ahead',
        compatible: false,
        message: `Extraction uses schema ${found}, newer than this build's ${SCHEMA_VERSION} ` +
            `(breaking change between majors). Upgrade dembrandt to read it reliably.`,
    };
}
/**
 * One-line notice for surfacing a compatibility verdict in a UI or log. Returns
 * null when there is nothing to warn about, so callers can render unconditionally:
 * `const notice = formatCompatibilityNotice(checkSchemaCompatibility(result));`
 */
export function formatCompatibilityNotice(compat) {
    return compat.compatible ? null : compat.message;
}
//# sourceMappingURL=version.js.map