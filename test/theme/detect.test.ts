import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectVersion } from "../../src/theme/detect.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(here, "..", "fixtures", name);

describe("detectVersion", () => {
  it("detects v3 via package.json", async () => {
    const result = await detectVersion(fixture("v3-basic"));
    expect(result.version).toBe(3);
    expect(result.reason).toContain("package.json");
  });

  it("detects v4 via package.json", async () => {
    const result = await detectVersion(fixture("v4-basic"));
    expect(result.version).toBe(4);
    expect(result.reason).toContain("package.json");
  });

  it("detects v3 via monorepo preset fixture", async () => {
    const result = await detectVersion(fixture("v3-monorepo-preset"));
    expect(result.version).toBe(3);
  });

  it("detects v4 via shadcn-style fixture", async () => {
    const result = await detectVersion(fixture("v4-shadcn"));
    expect(result.version).toBe(4);
  });

  it("throws when no tailwind project is present", async () => {
    await expect(detectVersion(here)).rejects.toThrow(/no tailwind project/);
  });
});
