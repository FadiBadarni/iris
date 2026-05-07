import { describe, expect, test } from "vitest";
import { synthesizeV3Config } from "../../src/lint/config-synth.js";
import type { ResolvedTheme, TokenEntry } from "../../src/theme/types.js";

function theme(entries: Array<Pick<TokenEntry, "name" | "value" | "type">>): ResolvedTheme {
  const tokens = new Map<string, TokenEntry>();
  const byValue = new Map<string, TokenEntry[]>();
  for (const partial of entries) {
    const entry: TokenEntry = { source: "v4-theme", file: "test.css", ...partial };
    tokens.set(entry.name, entry);
    const list = byValue.get(entry.value) ?? [];
    list.push(entry);
    byValue.set(entry.value, list);
  }
  return { version: 4, tokens, byValue, sources: ["test.css"], warnings: [] };
}

describe("synthesizeV3Config", () => {
  test("nests colors as flat dashed keys under theme.extend.colors", () => {
    const t = theme([
      { name: "colors.brand.salmon", value: "#fa8072", type: "color" },
      { name: "colors.muted", value: "#f3f4f6", type: "color" },
    ]);
    const config = synthesizeV3Config(t);
    expect(config.theme?.extend?.colors).toEqual({
      "brand-salmon": "#fa8072",
      muted: "#f3f4f6",
    });
  });

  test("places spacing/fontSize/etc. as flat namespaces", () => {
    const t = theme([
      { name: "spacing.4", value: "16px", type: "spacing" },
      { name: "fontSize.sm", value: "14px", type: "fontSize" },
      { name: "borderRadius.lg", value: "0.5rem", type: "borderRadius" },
    ]);
    const config = synthesizeV3Config(t);
    expect(config.theme?.extend?.spacing).toEqual({ "4": "16px" });
    expect(config.theme?.extend?.fontSize).toEqual({ sm: "14px" });
    expect(config.theme?.extend?.borderRadius).toEqual({ lg: "0.5rem" });
  });

  test("ignores tokens with unknown TokenType", () => {
    const t = theme([{ name: "other.weird", value: "blah", type: "other" }]);
    const config = synthesizeV3Config(t);
    expect(config.theme?.extend).toEqual({});
  });

  test("returns identity-stable object across calls (for plugin cache)", () => {
    const t = theme([{ name: "colors.muted", value: "#f3f4f6", type: "color" }]);
    const a = synthesizeV3Config(t);
    const b = synthesizeV3Config(t);
    expect(a).toBe(b);
  });

  test("ignores tokens without a namespace dot", () => {
    const t = theme([
      // Should be skipped — no dot, no namespace.
      { name: "rogue", value: "foo", type: "color" },
      { name: "colors.muted", value: "#f3f4f6", type: "color" },
    ]);
    const config = synthesizeV3Config(t);
    expect(config.theme?.extend?.colors).toEqual({ muted: "#f3f4f6" });
  });

  test("on key collision, higher source precedence wins (user > bridge > default)", () => {
    // Both `colors.brand.salmon` and `colors.brand-salmon` flatten to the
    // same v3 key `brand-salmon`. The v4-theme entry should win over the
    // v4-default entry regardless of insertion order.
    const tokens = new Map<string, TokenEntry>();
    const a: TokenEntry = {
      name: "colors.brand.salmon",
      value: "#default",
      type: "color",
      source: "v4-default",
      file: "default.css",
    };
    const b: TokenEntry = {
      name: "colors.brand-salmon",
      value: "#user",
      type: "color",
      source: "v4-theme",
      file: "user.css",
    };
    // Insert default FIRST so the user-defined would overwrite naturally.
    tokens.set(a.name, a);
    tokens.set(b.name, b);
    const config = synthesizeV3Config({
      version: 4,
      tokens,
      byValue: new Map(),
      sources: [],
      warnings: [],
    });
    expect(config.theme?.extend?.colors).toEqual({ "brand-salmon": "#user" });
  });

  test("on key collision, default does not overwrite user-defined", () => {
    // Inverse insertion order: user-defined FIRST, default SECOND. The user
    // value must still win.
    const tokens = new Map<string, TokenEntry>();
    const user: TokenEntry = {
      name: "colors.brand-salmon",
      value: "#user",
      type: "color",
      source: "v4-theme",
      file: "user.css",
    };
    const def: TokenEntry = {
      name: "colors.brand.salmon",
      value: "#default",
      type: "color",
      source: "v4-default",
      file: "default.css",
    };
    tokens.set(user.name, user);
    tokens.set(def.name, def);
    const config = synthesizeV3Config({
      version: 4,
      tokens,
      byValue: new Map(),
      sources: [],
      warnings: [],
    });
    expect(config.theme?.extend?.colors).toEqual({ "brand-salmon": "#user" });
  });
});
