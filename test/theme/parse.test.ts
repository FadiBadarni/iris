import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { clearCache } from "../../src/theme/cache.js";
import { lookupByName, lookupByValue, parseTheme } from "../../src/theme/parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(here, "..", "fixtures", name);

describe("parseTheme dispatcher", () => {
  beforeEach(async () => {
    await clearCache();
  });

  it("dispatches to the v3 adapter for a v3 project", async () => {
    const theme = await parseTheme({ cwd: fixture("v3-basic"), noCache: true });
    expect(theme.version).toBe(3);
    expect(theme.tokens.get("colors.brand.salmon")?.value).toBe("#fa8072");
  });

  it("dispatches to the v4 adapter for a v4 project", async () => {
    const theme = await parseTheme({ cwd: fixture("v4-basic"), noCache: true });
    expect(theme.version).toBe(4);
    expect(theme.tokens.get("colors.brand-salmon")?.value).toBe("#fa8072");
  });

  it("exposes lookupByValue across both versions", async () => {
    const v3 = await parseTheme({ cwd: fixture("v3-basic"), noCache: true });
    const v4 = await parseTheme({ cwd: fixture("v4-basic"), noCache: true });

    expect(lookupByValue(v3, "#fa8072").length).toBeGreaterThan(0);
    expect(lookupByValue(v4, "#fa8072").length).toBeGreaterThan(0);
    expect(lookupByValue(v3, "#unknown")).toEqual([]);
  });

  it("exposes lookupByName", async () => {
    const v3 = await parseTheme({ cwd: fixture("v3-basic"), noCache: true });
    expect(lookupByName(v3, "colors.muted")?.value).toBe("#f3f4f6");
    expect(lookupByName(v3, "missing.token")).toBeUndefined();
  });

  it("returns the same theme on a second call (cache hit) when noCache is omitted", async () => {
    await clearCache();
    const first = await parseTheme({ cwd: fixture("v3-basic") });
    const second = await parseTheme({ cwd: fixture("v3-basic") });
    // Cache hit should produce equivalent content; structural equality on
    // tokens is enough — instance identity isn't guaranteed because the cache
    // re-deserializes from disk on a memory miss.
    expect(second.tokens.size).toBe(first.tokens.size);
    expect(second.tokens.get("colors.brand")?.value).toBe(first.tokens.get("colors.brand")?.value);
  });

  it("noCache: true forces a fresh parse", async () => {
    const t1 = await parseTheme({ cwd: fixture("v3-basic"), noCache: true });
    const t2 = await parseTheme({ cwd: fixture("v3-basic"), noCache: true });
    expect(t1.tokens.size).toBe(t2.tokens.size);
  });

  it("loads tokens from a non-standard CSS path via the entry override", async () => {
    const theme = await parseTheme({
      cwd: fixture("v4-custom-entry"),
      entry: "packages/ui/src/theme.css",
      noCache: true,
    });
    expect(theme.version).toBe(4);
    expect(theme.tokens.get("colors.monorepo-brand")?.value).toBe("oklch(0.5 0.2 264)");
    expect(theme.tokens.get("spacing.monorepo")?.value).toBe("1.75rem");
  });

  it("composite cache key separates entries under the same project root", async () => {
    await clearCache();

    // First entry — set up cache for entry A
    const t1 = await parseTheme({
      cwd: fixture("v4-custom-entry"),
      entry: "packages/ui/src/theme.css",
    });
    expect(t1.tokens.get("colors.monorepo-brand")).toBeDefined();

    // Different entry under the same project root must not hit the cache
    // for the first entry. With the broken single-key cache, this would
    // return t1's tokens.
    await expect(
      parseTheme({
        cwd: fixture("v4-custom-entry"),
        entry: "does-not-exist.css",
      }),
    ).rejects.toThrow(/--entry "does-not-exist.css" not found/);
  });

  it("throws cleanly when entry is set but the file is missing", async () => {
    await expect(
      parseTheme({
        cwd: fixture("v4-custom-entry"),
        entry: "missing/file.css",
        noCache: true,
      }),
    ).rejects.toThrow(/not found relative to/);
  });
});
