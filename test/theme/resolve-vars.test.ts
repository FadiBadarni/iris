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

  it("ignores --vars declared in component-scoped descendant selectors", () => {
    // `.dark .panel { --bg: ... }` is component-scoped — those vars only
    // apply inside .panel under .dark and must not pollute the global map.
    const vars = buildVarMap(root(".dark .panel { --bg: rgb(0 0 0); }"));
    expect(vars.has("--bg")).toBe(false);
  });

  it("collects from comma-separated lists where every branch is a global anchor", () => {
    const vars = buildVarMap(root('.dark, :root[data-theme="dim"] { --bg: rgb(0 0 0); }'));
    expect(vars.get("--bg")).toBe("rgb(0 0 0)");
  });

  it("rejects a comma-separated list where any branch is descendant-scoped", () => {
    // Mixed list — one branch is global, one is descendant. Reject the
    // whole rule rather than partially collecting; the user's intent for
    // a mixed list is ambiguous and partial collection would silently
    // import component-scoped values.
    const vars = buildVarMap(root(":root, .dark .panel { --bg: rgb(0 0 0); }"));
    expect(vars.has("--bg")).toBe(false);
  });

  it("accepts :root with attribute selectors", () => {
    const vars = buildVarMap(root(':root[data-theme="dim"] { --primary: oklch(0.4 0.2 200); }'));
    expect(vars.get("--primary")).toBe("oklch(0.4 0.2 200)");
  });

  it("accepts :is(...) and :where(...) wrappers around global anchors", () => {
    // shadcn's current dark-mode pattern. Splitting blindly on commas
    // would cut `:is(:root, .dark)` at the inner comma and reject the rule.
    const vars1 = buildVarMap(root(":is(:root, .dark) { --bg: rgb(0 0 0); }"));
    expect(vars1.get("--bg")).toBe("rgb(0 0 0)");

    const vars2 = buildVarMap(root(":where(:root, .dark) { --fg: rgb(255 255 255); }"));
    expect(vars2.get("--fg")).toBe("rgb(255 255 255)");
  });

  it('accepts whitespace inside [data-theme = "..."]', () => {
    // CSS allows whitespace around the attribute operator. The previous
    // regex required `[data-theme="x"]` exactly and rejected the spaced form.
    const vars = buildVarMap(root('[data-theme = "dim"] { --bg: rgb(10 10 10); }'));
    expect(vars.get("--bg")).toBe("rgb(10 10 10)");
  });

  it("rejects :is(...) wrappers that contain descendant selectors", () => {
    // :is(:root, .dark .panel) — the inner .dark .panel branch is not a
    // global anchor, so the whole rule must be rejected.
    const vars = buildVarMap(root(":is(:root, .dark .panel) { --bg: rgb(0 0 0); }"));
    expect(vars.has("--bg")).toBe(false);
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

  it("does not flag the same var referenced twice as circular", () => {
    // Box-shadow values commonly use the same color var twice for layered
    // shadows. Each occurrence is an independent chain, not a cycle.
    const vars = new Map([["--shadow-color", "rgb(0 0 0 / 0.1)"]]);
    const r = resolveVarChain("var(--shadow-color) 0 1px, var(--shadow-color) 0 4px", vars);
    expect(r.value).toBe("rgb(0 0 0 / 0.1) 0 1px, rgb(0 0 0 / 0.1) 0 4px");
    expect(r.circular).toBe(false);
  });

  it("does not flag repeated refs in nested chains as circular", () => {
    // --combo expands to two var(--x) references; --x then expands once.
    // The second --x in --combo's expansion must not see the first as
    // already-active.
    const vars = new Map([
      ["--x", "red"],
      ["--combo", "var(--x) var(--x)"],
    ]);
    const r = resolveVarChain("var(--combo)", vars);
    expect(r.value).toBe("red red");
    expect(r.circular).toBe(false);
  });

  it("resolves a function-shaped fallback with balanced parens", () => {
    // Regex-based fallback parsing previously stopped at the first `)` and
    // produced `oklch(0.5 0.2 264` (missing close paren). The AST walker
    // sees the full function fallback as one node.
    const r = resolveVarChain("var(--missing, oklch(0.5 0.2 264))", new Map());
    expect(r.value).toBe("oklch(0.5 0.2 264)");
    expect(r.unresolved).toEqual([]);
  });

  it("resolves a var inside another function with a function-shaped fallback", () => {
    // The exact case the regex broke: a var() with a function fallback
    // sitting inside another function. Resolution must keep parens balanced
    // both when the named var is found AND when it falls through to the
    // fallback.
    const vars = new Map([["--bg", "red"]]);
    const r = resolveVarChain("oklch(from var(--bg, oklch(0.5 0.2 264)) calc(l * 1.1))", vars);
    expect(r.value).toBe("oklch(from red calc(l * 1.1))");
  });

  it("preserves balanced parens when the function-fallback chain is taken", () => {
    const vars = new Map<string, string>();
    const r = resolveVarChain("oklch(from var(--bg, oklch(0.5 0.2 264)) calc(l * 1.1))", vars);
    expect(r.value).toBe("oklch(from oklch(0.5 0.2 264) calc(l * 1.1))");
  });
});
