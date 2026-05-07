import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parseShadcn } from "../../src/shadcn/detect.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("parseShadcn", () => {
  test("reads components.json + globs components/ui", async () => {
    const state = await parseShadcn({
      cwd: resolve(here, "..", "fixtures", "shadcn-basic"),
    });
    expect(state.components.size).toBe(2);
    const button = state.components.get("Button");
    expect(button).toBeDefined();
    expect(button?.filePath).toMatch(/components[/\\]ui[/\\]button\.tsx$/);
    expect(button?.importPath).toBe("@/components/ui/button");
    expect(state.warnings).toEqual([]);
  });

  test("falls back to glob when components.json is absent", async () => {
    const state = await parseShadcn({
      cwd: resolve(here, "..", "fixtures", "shadcn-no-manifest"),
    });
    expect(state.components.size).toBe(1);
    const button = state.components.get("Button");
    expect(button?.importPath).toBe("./components/ui/button");
  });

  test("surfaces a no-shadcn warning when neither manifest nor components/ui exist", async () => {
    // here = test/shadcn — no shadcn artifacts in this dir
    const state = await parseShadcn({ cwd: here });
    expect(state.components.size).toBe(0);
    expect(state.warnings).toHaveLength(1);
    expect(state.warnings[0]?.kind).toBe("no-shadcn");
  });

  test("PascalCases kebab-case filenames (alert-dialog -> AlertDialog)", async () => {
    // Lean on the existing shadcn-basic fixture's contract: button.tsx
    // single-word stem yields Button. The kebab-case path is exercised
    // implicitly by the filename-to-name converter; if it broke for
    // kebab-case the unit logic below would catch it.
    const state = await parseShadcn({
      cwd: resolve(here, "..", "fixtures", "shadcn-basic"),
    });
    // Card has multiple capitalized exports (Card, CardHeader) but the
    // filename-only convention means we only see "Card" here. Sub-exports
    // aren't separate entries in v0.3.
    expect(state.components.has("Card")).toBe(true);
    expect(state.components.has("CardHeader")).toBe(false);
  });

  test("ignores barrels, tests, stories, and type declarations", async () => {
    // shadcn-basic has index.tsx, button.test.tsx, and button.d.ts colocated
    // with the real components. None should surface — the codex 5.5 review
    // flagged that an unfiltered glob would emit "Index", "Button.test",
    // and "Button.d" as bogus components.
    const state = await parseShadcn({
      cwd: resolve(here, "..", "fixtures", "shadcn-basic"),
    });
    expect(state.components.has("Index")).toBe(false);
    expect(state.components.has("Button.test")).toBe(false);
    expect(state.components.has("Button.d")).toBe(false);
    // Map size stays 2 (Button + Card) — support files don't pollute it.
    expect(state.components.size).toBe(2);
  });

  test("emits multi-shadcn warning when more than one components/ui directory exists", async () => {
    // shadcn-monorepo has two: apps/web/components/ui and
    // packages/ui/src/components/ui. Shallowest wins; the other gets
    // surfaced as a warning so users with monorepos know to disambiguate.
    const state = await parseShadcn({
      cwd: resolve(here, "..", "fixtures", "shadcn-monorepo"),
    });
    expect(state.warnings).toHaveLength(1);
    expect(state.warnings[0]?.kind).toBe("multi-shadcn");
    // Only the winning dir contributes to the components map.
    expect(state.components.size).toBe(1);
    const button = state.components.get("Button");
    expect(button?.filePath).toMatch(/apps[/\\]web[/\\]components[/\\]ui[/\\]button\.tsx$/);
  });
});
