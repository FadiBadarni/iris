import type { TokenType } from "../theme/types.js";

// Tailwind utility classes have shape `prefix-[value]` (with optional leading
// variants like `dark:hover:`). We split off the variants, then split prefix
// from the bracketed body. Type comes from the prefix when unambiguous, or
// from inspecting the value when the prefix is multi-purpose (`text-` is the
// canonical case — `text-[14px]` is fontSize, `text-[#ccc]` is color).

// Optional leading `-` captures negative arbitrary spacing/inset utilities
// (`-mt-[8px]`, `-inset-[2px]`). The rewriter prepends the sign back when it
// builds the replacement class so the suggestion's polarity round-trips.
const ARBITRARY_CLASS = /^(-?)([a-z][a-z-]*)-\[([^\]]+)\]$/;

const PREFIX_TYPE: Record<string, TokenType> = {
  bg: "color",
  border: "color",
  ring: "color",
  outline: "color",
  fill: "color",
  stroke: "color",
  divide: "color",
  accent: "color",
  caret: "color",
  placeholder: "color",
  shadow: "boxShadow",
  rounded: "borderRadius",
  leading: "lineHeight",
  tracking: "letterSpacing",
  // Spacing-family prefixes. Tailwind has many; the ones below are the
  // common-use set. Anything missing falls through to value inference.
  w: "spacing",
  h: "spacing",
  size: "spacing",
  min: "spacing",
  max: "spacing",
  p: "spacing",
  px: "spacing",
  py: "spacing",
  pt: "spacing",
  pb: "spacing",
  pl: "spacing",
  pr: "spacing",
  m: "spacing",
  mx: "spacing",
  my: "spacing",
  mt: "spacing",
  mb: "spacing",
  ml: "spacing",
  mr: "spacing",
  gap: "spacing",
  inset: "spacing",
  top: "spacing",
  bottom: "spacing",
  left: "spacing",
  right: "spacing",
  space: "spacing",
};

export type ArbitraryClass = {
  prefix: string;
  value: string;
  type: TokenType;
  negative?: true;
};

export function decomposeClass(className: string): ArbitraryClass | null {
  if (!className) return null;
  const leaf = stripVariants(className);
  const m = leaf.match(ARBITRARY_CLASS);
  if (!m) return null;
  const sign = m[1] as string;
  const prefix = m[2] as string;
  const value = m[3] as string;
  const negative = sign === "-";

  const out = { prefix, value, type: chooseType(prefix, value) } as ArbitraryClass;
  if (negative) out.negative = true;
  return out;
}

function chooseType(prefix: string, value: string): TokenType {
  // `text-` straddles fontSize and color depending on the value shape. Decide
  // by sniffing the value first — if it's a color, it's a color, otherwise
  // it's a fontSize.
  if (prefix === "text") return looksLikeColor(value) ? "color" : "fontSize";
  const declared = PREFIX_TYPE[prefix];
  if (declared !== undefined) return declared;
  // No mapping — try to infer from the value as a fallback. Prevents the
  // rewriter from giving up on every novel utility.
  return inferTypeFromValue(value);
}

function stripVariants(className: string): string {
  const idx = className.lastIndexOf(":");
  return idx < 0 ? className : className.slice(idx + 1);
}

function looksLikeColor(value: string): boolean {
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return true;
  if (/^(oklch|oklab|hsl|hsla|rgb|rgba|color|lab|lch)\(/i.test(value)) return true;
  return false;
}

function inferTypeFromValue(value: string): TokenType {
  if (looksLikeColor(value)) return "color";
  if (/^[\d.]+(rem|em|px|vh|vw|%|ch|ex|pt|pc|cm|mm|in)$/i.test(value)) return "spacing";
  return "other";
}
