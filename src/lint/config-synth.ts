import type { ResolvedTheme, TokenType } from "../theme/types.js";

// Slice C.2 strategy: project iris's ResolvedTheme into a v3-shaped Tailwind
// config object that eslint-plugin-tailwindcss can hand to its rule engine
// (settings.tailwindcss.config). We extend rather than replace the default
// theme so Tailwind's built-in classes still validate — the alternative
// makes `bg-blue-500` flag as a custom class against any project that
// hasn't explicitly redefined it. The trade-off is that v4 namespace
// resets (`--color-*: initial`) silently leak the defaults back in; that's
// a known limitation we'll address when explicit reset tracking lands.
//
// The plugin caches the resolved Tailwind config keyed by object identity
// for ten seconds, so we memoize per ResolvedTheme — re-synthesizing from
// the same theme returns the same object reference and the cache hits.

export type SyntheticTailwindConfig = {
  theme?: {
    extend?: {
      colors?: Record<string, string>;
      spacing?: Record<string, string>;
      fontSize?: Record<string, string>;
      fontFamily?: Record<string, string>;
      fontWeight?: Record<string, string>;
      borderRadius?: Record<string, string>;
      lineHeight?: Record<string, string>;
      letterSpacing?: Record<string, string>;
      boxShadow?: Record<string, string>;
      screens?: Record<string, string>;
    };
  };
};

const NAMESPACE_FOR_TYPE: Record<
  Exclude<TokenType, "other">,
  keyof NonNullable<NonNullable<SyntheticTailwindConfig["theme"]>["extend"]>
> = {
  color: "colors",
  spacing: "spacing",
  fontSize: "fontSize",
  fontFamily: "fontFamily",
  fontWeight: "fontWeight",
  borderRadius: "borderRadius",
  lineHeight: "lineHeight",
  letterSpacing: "letterSpacing",
  boxShadow: "boxShadow",
  screen: "screens",
};

const cache = new WeakMap<ResolvedTheme, SyntheticTailwindConfig>();

export function synthesizeV3Config(theme: ResolvedTheme): SyntheticTailwindConfig {
  const cached = cache.get(theme);
  if (cached !== undefined) return cached;

  const extend: NonNullable<NonNullable<SyntheticTailwindConfig["theme"]>["extend"]> = {};

  for (const entry of theme.tokens.values()) {
    if (entry.type === "other") continue;
    const dot = entry.name.indexOf(".");
    if (dot < 0) continue;
    const tail = entry.name.slice(dot + 1);
    if (!tail) continue;
    const ns = NAMESPACE_FOR_TYPE[entry.type];
    const key = tail.replace(/\./g, "-");
    let bucket = extend[ns];
    if (bucket === undefined) {
      bucket = {};
      extend[ns] = bucket;
    }
    bucket[key] = entry.value;
  }

  const config: SyntheticTailwindConfig = { theme: { extend } };
  cache.set(theme, config);
  return config;
}
