// Inlined asset bytes exist for the exports (report, PDF, app), which render
// them. An agent cannot use base64 pixels, and a logo plus favicons can run to
// hundreds of kilobytes of its context, so they are replaced by a marker.
export function stripAssetBytes(value) {
  if (Array.isArray(value)) return value.map(stripAssetBytes);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = k === "dataUri" && typeof v === "string" && v.length > 256
      ? `<${v.slice(0, v.indexOf(",") + 1)}… ${v.length} chars, omitted>`
      : stripAssetBytes(v);
  }
  return out;
}

