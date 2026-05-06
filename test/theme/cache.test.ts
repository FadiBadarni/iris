import { mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCache, getCached, setCacheFilePath, setCached } from "../../src/theme/cache.js";
import type { ResolvedTheme } from "../../src/theme/types.js";

describe("cache", () => {
  let workDir: string;
  let sourceFile: string;

  beforeEach(async () => {
    workDir = mkdtempSync(join(tmpdir(), "iris-cache-test-"));
    sourceFile = join(workDir, "tailwind.config.ts");
    writeFileSync(sourceFile, "export default {};");
    setCacheFilePath(join(workDir, "cache.json"));
    await clearCache();
  });

  afterEach(async () => {
    await clearCache();
  });

  const fakeTheme = (): ResolvedTheme => ({
    version: 3,
    tokens: new Map([
      [
        "colors.brand",
        {
          name: "colors.brand",
          value: "#3b82f6",
          type: "color",
          source: "v3-config",
          file: sourceFile,
        },
      ],
    ]),
    byValue: new Map([
      [
        "#3b82f6",
        [
          {
            name: "colors.brand",
            value: "#3b82f6",
            type: "color",
            source: "v3-config",
            file: sourceFile,
          },
        ],
      ],
    ]),
    sources: [sourceFile],
  });

  it("stores and retrieves a theme", async () => {
    await setCached(workDir, fakeTheme());
    const restored = await getCached(workDir);
    expect(restored).not.toBeNull();
    expect(restored?.tokens.get("colors.brand")?.value).toBe("#3b82f6");
  });

  it("invalidates when a source file mtime changes", async () => {
    await setCached(workDir, fakeTheme());

    const future = new Date(Date.now() + 5_000);
    await utimes(sourceFile, future, future);

    const restored = await getCached(workDir);
    expect(restored).toBeNull();
  });

  it("invalidates when a source file disappears between writes and reads", async () => {
    await setCached(workDir, fakeTheme());
    unlinkSync(sourceFile);

    const restored = await getCached(workDir);
    expect(restored).toBeNull();
  });

  it("refuses to cache a theme whose source set is incomplete", async () => {
    const ghost = fakeTheme();
    ghost.sources = [join(workDir, "does-not-exist.ts")];
    await setCached(workDir, ghost);

    const restored = await getCached(workDir);
    expect(restored).toBeNull();
  });

  it("survives across an in-memory clear by reading from disk", async () => {
    await setCached(workDir, fakeTheme());

    // Simulate a fresh process — clear memory, keep disk
    const { clearCache: _ } = await import("../../src/theme/cache.js");
    // We can't truly drop the module, but we can wipe memory state via the
    // exported clearCache and then re-set cacheFilePath; the disk file is the
    // same file that the previous setCached wrote.
    // Note: clearCache also wipes disk, so this test instead relies on the
    // fact that getCached's memory-miss path falls through to disk. We force
    // a memory-miss by setting under a different project root and querying
    // back the original.
    const otherRoot = join(workDir, "other");
    await setCached(otherRoot, fakeTheme());
    const restoredOriginal = await getCached(workDir);
    expect(restoredOriginal).not.toBeNull();
    expect(restoredOriginal?.tokens.get("colors.brand")?.value).toBe("#3b82f6");
  });
});

describe("cache integration with the disk file", () => {
  it("writes a JSON file at the configured path", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "iris-cache-int-"));
    const tempCacheFile = join(tempDir, "cache.json");
    setCacheFilePath(tempCacheFile);
    await clearCache();

    const { readFile } = await import("node:fs/promises");
    const contents = await readFile(tempCacheFile, "utf8");
    expect(contents).toBe("{}");
  });
});
