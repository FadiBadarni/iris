import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { buildVarMap, resolveVarChain } from "../../src/theme/resolve-vars.js";

const root = (css: string) => postcss.parse(css);

describe("buildVarMap", () => {
  it("collects --vars from :root", () => {
    const vars = buildVarMap(root(":root { --bg: oklch(1 0 0); --fg: oklch(0 0 0); }"));
    expect(vars.get("--bg")).toBe("oklch(1 0 0)");
    expect(vars.get("--fg")).toBe("oklch(0 0 0)");
  });

  it("recurses into @layer base { :root { ... } }", () => {
    const vars = buildVarMap(root("@layer base { :root { --primary: oklch(0.5 0.2 264); } }"));
    expect(vars.get("--primary")).toBe("oklch(0.5 0.2 264)");
  });

  it("first occurrence wins on collision", () => {
    const vars = buildVarMap(
      root(":root { --bg: oklch(1 0 0); } .dark { --bg: oklch(0.15 0 0); }"),
    );
    expect(vars.get("--bg")).toBe("oklch(1 0 0)");
  });
});

describe("resolveVarChain", () => {
  it("returns the value unchanged when no var() ref is present", () => {
    const r = resolveVarChain("oklch(0.5 0.2 264)", new Map());
    expect(r.value).toBe("oklch(0.5 0.2 264)");
    expect(r.unresolved).toEqual([]);
    expect(r.circular).toBe(false);
  });

  it("resolves a single-hop var() reference", () => {
    const vars = new Map([["--primary", "oklch(0.5 0.2 264)"]]);
    const r = resolveVarChain("var(--primary)", vars);
    expect(r.value).toBe("oklch(0.5 0.2 264)");
  });

  it("resolves a two-hop chain", () => {
    const vars = new Map([
      ["--radius", "0.5rem"],
      ["--radius-card", "var(--radius)"],
    ]);
    const r = resolveVarChain("var(--radius-card)", vars);
    expect(r.value).toBe("0.5rem");
  });

  it("uses the fallback when the var is unknown", () => {
    const r = resolveVarChain("var(--missing, #ff0000)", new Map());
    expect(r.value).toBe("#ff0000");
    expect(r.unresolved).toEqual([]);
  });

  it("reports unresolved refs without a fallback", () => {
    const r = resolveVarChain("var(--missing)", new Map());
    expect(r.unresolved).toContain("--missing");
    // Value falls back to the original-ish form so callers can still see it
    expect(r.value).toContain("var(--missing)");
  });

  it("detects circular references and stops resolving", () => {
    const vars = new Map([
      ["--a", "var(--b)"],
      ["--b", "var(--a)"],
    ]);
    const r = resolveVarChain("var(--a)", vars);
    expect(r.circular).toBe(true);
  });
});
