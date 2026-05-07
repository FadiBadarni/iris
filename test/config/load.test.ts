import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { loadConfig } from "../../src/config/load.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, "..", "fixtures");

describe("loadConfig", () => {
  test("loads iris.config.ts via defineConfig", async () => {
    const cfg = await loadConfig({ cwd: resolve(fixtures, "iris-config-ts") });
    expect(cfg).toBeDefined();
    expect(cfg?.rules?.["iris/no-reinventing-shadcn"]).toBe("off");
    expect(cfg?.rules?.["tailwindcss/no-arbitrary-value"]).toBe("warn");
    expect(cfg?.allowlist).toEqual(["bg-\\[hsl\\(.*\\)\\]"]);
  });

  test("loads iris.config.mjs (no defineConfig wrapper)", async () => {
    const cfg = await loadConfig({ cwd: resolve(fixtures, "iris-config-mjs") });
    expect(cfg).toBeDefined();
    expect(cfg?.rules?.["iris/no-reinventing-shadcn"]).toBe("warn");
  });

  test("returns null when no config file exists", async () => {
    // here = test/config — no iris.config.* in this dir or its parents we
    // care about; the loader checks the supplied cwd only, not parents.
    const cfg = await loadConfig({ cwd: here });
    expect(cfg).toBeNull();
  });

  test("throws a clear diagnostic when the config has no default export", async () => {
    // The malformed fixture exports a number under a named export and no
    // default. The loader should reject with a message that names the
    // file path so the user can fix it.
    await expect(loadConfig({ cwd: resolve(fixtures, "iris-config-malformed") })).rejects.toThrow(
      /iris-config-malformed.*iris.config\.ts.*defineConfig/s,
    );
  });

  test("throws on an invalid severity (catches user 'warning' vs 'warn' typo)", async () => {
    // Without runtime validation a `rules: { ...: "warning" }` typo would
    // silently no-op at lint time. The loader catches it.
    await expect(
      loadConfig({ cwd: resolve(fixtures, "iris-config-bad-severity") }),
    ).rejects.toThrow(/invalid severity.*warning/i);
  });
});
