import type { ResolvedTheme, TokenEntry, TokenSource, TokenType } from "../theme/types.js";
import { decomposeClass } from "./decompose.js";
import type { SuggestCandidate, SuggestResult } from "./types.js";

// Spacing/fontSize near-match thresholds, in px.
const FONT_SIZE_THRESHOLD_PX = 2;
const SPACING_THRESHOLD_PX = 4;

const SOURCE_RANK: Record<TokenSource, number> = {
  "v4-theme": 0,
  "v3-config": 0,
  "v4-config-bridge": 1,
  "v4-default": 2,
};

export function suggestToken(className: string, theme: ResolvedTheme): SuggestResult {
  const decomposed = decomposeClass(className);
  if (!decomposed) return { kind: "none" };
  const { prefix, value, type, negative } = decomposed;
  const sign = negative ? "-" : "";

  // 1. Exact match in byValue, filtered by type.
  const exact = lookupExact(theme, value, type);
  if (exact.length === 1) {
    const entry = exact[0] as TokenEntry;
    return {
      kind: "exact",
      tokenName: entry.name,
      replacement: buildReplacement(sign, prefix, entry.name),
    };
  }
  if (exact.length > 1) {
    const ordered = exact.slice().sort(compareCandidates);
    const candidates: SuggestCandidate[] = ordered.map((e) => ({
      tokenName: e.name,
      replacement: buildReplacement(sign, prefix, e.name),
    }));
    return { kind: "ambiguous", candidates };
  }

  // 2. Numeric near-match for spacing/fontSize. Colors and other types
  //    don't get near-match in slice C.1 — colors need OKLab ΔE which lands
  //    when culori is added.
  if (type === "fontSize" || type === "spacing") {
    const wantPx = parsePx(value);
    if (wantPx === null) return { kind: "none" };
    const threshold = type === "fontSize" ? FONT_SIZE_THRESHOLD_PX : SPACING_THRESHOLD_PX;
    let best: { entry: TokenEntry; delta: number } | null = null;
    for (const entry of theme.tokens.values()) {
      if (entry.type !== type) continue;
      const tokenPx = parsePx(entry.value);
      if (tokenPx === null) continue;
      const delta = Math.abs(tokenPx - wantPx);
      if (delta > threshold) continue;
      if (best === null || delta < best.delta) {
        best = { entry, delta };
      }
    }
    if (best !== null) {
      return {
        kind: "near",
        tokenName: best.entry.name,
        replacement: buildReplacement(sign, prefix, best.entry.name),
        delta: best.delta,
      };
    }
  }

  return { kind: "none" };
}

function lookupExact(theme: ResolvedTheme, value: string, type: TokenType): TokenEntry[] {
  const direct = theme.byValue.get(value);
  if (direct) {
    const matches = direct.filter((e) => e.type === type);
    if (matches.length > 0) return matches;
  }
  // Fall back to a px-normalized scan for spacing/fontSize so a class like
  // `text-[14px]` still hits a token recorded as `0.875rem`.
  if (type === "fontSize" || type === "spacing") {
    const wantPx = parsePx(value);
    if (wantPx === null) return [];
    const out: TokenEntry[] = [];
    for (const entry of theme.tokens.values()) {
      if (entry.type !== type) continue;
      const entryPx = parsePx(entry.value);
      if (entryPx === null) continue;
      if (entryPx === wantPx) out.push(entry);
    }
    return out;
  }
  return [];
}

function buildReplacement(sign: string, prefix: string, tokenName: string): string {
  // Token name `colors.brand.salmon` → tail `brand-salmon`.
  // The first dotted segment is the namespace (colors / fontSize / spacing /
  // …); the rest is the class tail with dashes between. Sign carries through
  // for negative arbitrary spacing — `-mt-[8px]` round-trips as `-mt-2`.
  const parts = tokenName.split(".");
  const tail = parts.slice(1).join("-");
  return `${sign}${prefix}-${tail}`;
}

function compareCandidates(a: TokenEntry, b: TokenEntry): number {
  // 1) Shortest tail wins — `muted` beats `background`.
  const tailA = a.name.split(".").slice(1).join("-");
  const tailB = b.name.split(".").slice(1).join("-");
  if (tailA.length !== tailB.length) return tailA.length - tailB.length;
  // 2) Source precedence — user-defined beats defaults.
  const rankA = SOURCE_RANK[a.source];
  const rankB = SOURCE_RANK[b.source];
  if (rankA !== rankB) return rankA - rankB;
  // 3) Alphabetical for determinism.
  return a.name.localeCompare(b.name);
}

function parsePx(value: string): number | null {
  const trimmed = value.trim();
  const pxMatch = trimmed.match(/^([+-]?[\d.]+)px$/i);
  if (pxMatch?.[1]) return Number.parseFloat(pxMatch[1]);
  const remMatch = trimmed.match(/^([+-]?[\d.]+)rem$/i);
  if (remMatch?.[1]) return Number.parseFloat(remMatch[1]) * 16;
  return null;
}
