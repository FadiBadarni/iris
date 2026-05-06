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
});
