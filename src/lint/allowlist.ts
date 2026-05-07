// Slice B keeps the allowlist simple: a list of regexes a class is matched
// against. The structured-pattern object layout the spec talks about
// (`{ kind: 'class-contains' }`, etc.) lands when iris.config.ts arrives in
// v0.2 — by then user customization is the driver, and a structured shape
// serializes through MCP cleanly. For now, regex covers every acceptance
// case and stays one file.

export type AllowlistPattern = RegExp;

export const DEFAULT_ALLOWLIST: AllowlistPattern[] = [
  // Anything with a CSS custom property reference is project-intent — even if
  // the surrounding utility isn't one we'd otherwise allow, `var(--*)` means
  // the value comes from the design system at runtime.
  /var\(--/,

  // Image-like background values. `bg-[url(...)]` is the canonical case;
  // `bg-[image:...]` covers gradient/image fn wrappers.
  /^bg-\[url\(/,
  /^bg-\[image:/,

  // Grid track sizing. `1fr_2fr`, `auto_1fr_auto`, `minmax(0,1fr)`, etc. We
  // detect any presence of an `fr` track inside a grid-cols/grid-rows
  // arbitrary value — there's no token equivalent for fractional grid tracks.
  // \d+fr (rather than \bfr\b) because `1fr` is digit-letter without a regex
  // word boundary in between.
  /^grid-(cols|rows)-\[[^\]]*\d+(?:\.\d+)?fr/,

  // Pseudo-element content. Any value is intentional ("→", "•", attr(...),
  // counter(...)) — these aren't theme-able.
  /^content-\[/,

  // Clip path geometry. polygon/circle/ellipse/inset values are layout-
  // specific and don't belong in the spacing/color scale.
  /^clip-path-\[/,

  // Arbitrary properties: `[mask-image:...]`, `[mask-size:auto]`,
  // `[content-visibility:auto]`, `[grid-template-columns:1fr_2fr]`,
  // `[font-feature-settings:'cv11']`, etc. The bracket-prefixed `property:`
  // shape signals an intentional CSS-property assignment at the utility
  // level — these classes don't have token equivalents and should never be
  // rewritten.
  /^\[[a-z-]+:/,
];

export function isAllowlisted(className: string, patterns: AllowlistPattern[]): boolean {
  return patterns.some((p) => p.test(className));
}
