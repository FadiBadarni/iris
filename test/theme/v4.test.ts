import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseV4 } from "../../src/theme/v4.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(here, "..", "fixtures", name);

describe("parseV4", () => {
  it("extracts tokens from a basic v4 @theme block", async () => {
    const theme = await parseV4(fixture("v4-basic"));

    expect(theme.version).toBe(4);
    expect(theme.tokens.get("colors.brand")?.value).toBe("#3b82f6");
    expect(theme.tokens.get("colors.brand-salmon")?.value).toBe("#fa8072");
    expect(theme.tokens.get("colors.muted")?.value).toBe("#f3f4f6");
    expect(theme.tokens.get("spacing.gutter")?.value).toBe("1.5rem");
    expect(theme.tokens.get("fontSize.display")?.value).toBe("3rem");
    expect(theme.tokens.get("borderRadius.card")?.value).toBe("0.75rem");
  });

  it("infers types from prefix conventions", async () => {
    const theme = await parseV4(fixture("v4-basic"));
    expect(theme.tokens.get("colors.brand")?.type).toBe("color");
    expect(theme.tokens.get("spacing.gutter")?.type).toBe("spacing");
    expect(theme.tokens.get("fontSize.display")?.type).toBe("fontSize");
    expect(theme.tokens.get("borderRadius.card")?.type).toBe("borderRadius");
  });

  it("indexes tokens by value for reverse lookup", async () => {
    const theme = await parseV4(fixture("v4-basic"));
    const matches = theme.byValue.get("#fa8072");
    expect(matches).toBeDefined();
    expect(matches?.[0]?.name).toBe("colors.brand-salmon");
  });

  it("falls back to value-heuristic typing for shadcn-style variables without prefix", async () => {
    const theme = await parseV4(fixture("v4-shadcn"));

    // None of these match the --color-* prefix convention, but the value
    // is oklch(...) so the heuristic must classify them as color tokens.
    expect(theme.tokens.get("colors.primary")?.type).toBe("color");
    expect(theme.tokens.get("colors.muted-foreground")?.type).toBe("color");
    expect(theme.tokens.get("colors.destructive")?.type).toBe("color");

    // --radius is also non-prefix; value-heuristic classifies it as spacing
    // (closest dimension match). Acceptable as a v0.1 fallback.
    expect(theme.tokens.get("spacing.radius")?.type).toBe("spacing");
  });

  it("tracks the entry css in sources", async () => {
    const theme = await parseV4(fixture("v4-basic"));
    const expected = resolve(fixture("v4-basic"), "app", "globals.css");
    expect(theme.sources).toContain(expected);
  });
});

describe("parseV4 @config bridge", () => {
  it("merges tokens from a v3 config referenced via @config", async () => {
    const theme = await parseV4(fixture("v4-config-bridge"));

    // CSS @theme wins for colliding names — brand stays #ef4444 not #3b82f6
    expect(theme.tokens.get("colors.brand")?.value).toBe("#ef4444");
    expect(theme.tokens.get("colors.brand")?.source).toBe("v4-theme");

    // JS-only token survives the bridge with the v4-config-bridge source tag
    const legacy = theme.tokens.get("colors.legacy");
    expect(legacy?.value).toBe("#1e40af");
    expect(legacy?.source).toBe("v4-config-bridge");

    // Pure CSS token is also present
    expect(theme.tokens.get("spacing.tight")?.value).toBe("0.25rem");
  });

  it("tracks both the css entry and the bridged js config in sources", async () => {
    const theme = await parseV4(fixture("v4-config-bridge"));

    const cssEntry = resolve(fixture("v4-config-bridge"), "app", "globals.css");
    const tsConfig = resolve(fixture("v4-config-bridge"), "tailwind.config.ts");

    expect(theme.sources).toContain(cssEntry);
    expect(theme.sources).toContain(tsConfig);
  });
});

describe("parseV4 var() resolution", () => {
  it("resolves @theme inline aliases to their :root values", async () => {
    const theme = await parseV4(fixture("v4-shadcn-vars"));

    expect(theme.tokens.get("colors.background")?.value).toBe("oklch(1 0 0)");
    expect(theme.tokens.get("colors.foreground")?.value).toBe("oklch(0.145 0 0)");
    expect(theme.tokens.get("colors.primary")?.value).toBe("oklch(0.205 0 0)");
    expect(theme.tokens.get("colors.destructive")?.value).toBe("oklch(0.577 0.245 27.325)");
  });

  it("resolves chained var() through multiple hops", async () => {
    const theme = await parseV4(fixture("v4-shadcn-vars"));

    expect(theme.tokens.get("borderRadius.card")?.value).toBe("0.625rem");
    expect(theme.tokens.get("borderRadius.lg")?.value).toBe("0.625rem");
  });

  it("infers token type from the resolved value, not the var() string", async () => {
    const theme = await parseV4(fixture("v4-shadcn-vars"));

    // --color-primary alias to var(--primary). Only the resolved
    // oklch(...) value typed as color; the unresolved var(...) would
    // have typed as "other" and broken every linter color lookup.
    expect(theme.tokens.get("colors.primary")?.type).toBe("color");
  });

  it("reverse byValue lookup hits the resolved value, not the var() string", async () => {
    const theme = await parseV4(fixture("v4-shadcn-vars"));

    const matches = theme.byValue.get("oklch(0.205 0 0)");
    expect(matches).toBeDefined();
    expect(matches?.[0]?.name).toBe("colors.primary");
  });

  it("reports unresolved var refs as warnings without crashing the parse", async () => {
    const theme = await parseV4(fixture("v4-shadcn-vars"));

    // The fixture deliberately includes a --color-missing aliased to a var
    // that isn't declared anywhere — should surface as a structured warning.
    const unresolved = theme.warnings.filter((w) => w.kind === "var-unresolved");
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved.some((w) => w.message.includes("--this-does-not-exist"))).toBe(true);
  });
});
