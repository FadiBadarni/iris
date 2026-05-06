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
