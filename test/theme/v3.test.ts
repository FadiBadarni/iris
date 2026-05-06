import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseV3 } from "../../src/theme/v3.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(here, "..", "fixtures", name);

describe("parseV3", () => {
  it("extracts theme.extend tokens from a basic v3 config", async () => {
    const theme = await parseV3(fixture("v3-basic"));

    expect(theme.version).toBe(3);
    expect(theme.tokens.get("colors.brand")?.value).toBe("#3b82f6");
    expect(theme.tokens.get("colors.brand.salmon")?.value).toBe("#fa8072");
    expect(theme.tokens.get("colors.muted")?.value).toBe("#f3f4f6");
    expect(theme.tokens.get("spacing.gutter")?.value).toBe("1.5rem");
  });

  it("indexes tokens by value for reverse lookup", async () => {
    const theme = await parseV3(fixture("v3-basic"));
    const matches = theme.byValue.get("#fa8072");
    expect(matches).toBeDefined();
    expect(matches?.[0]?.name).toBe("colors.brand.salmon");
    expect(matches?.[0]?.type).toBe("color");
  });

  it("infers token types from the top-level theme key", async () => {
    const theme = await parseV3(fixture("v3-basic"));
    expect(theme.tokens.get("colors.muted")?.type).toBe("color");
    expect(theme.tokens.get("spacing.gutter")?.type).toBe("spacing");
    expect(theme.tokens.get("fontSize.display")?.type).toBe("fontSize");
  });

  it("extracts the first element from fontSize tuples", async () => {
    const theme = await parseV3(fixture("v3-basic"));
    expect(theme.tokens.get("fontSize.display")?.value).toBe("3rem");
  });

  it("tracks every imported preset file in sources for cache invalidation", async () => {
    const theme = await parseV3(fixture("v3-monorepo-preset"));

    const presetPath = resolve(fixture("v3-monorepo-preset"), "preset", "tailwind.preset.ts");
    const configPath = resolve(fixture("v3-monorepo-preset"), "tailwind.config.ts");

    expect(theme.sources).toContain(configPath);
    expect(theme.sources).toContain(presetPath);
    expect(theme.tokens.get("colors.primary")?.value).toBe("#1e40af");
    expect(theme.tokens.get("colors.accent")?.value).toBe("#fa8072");
  });
});
