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
});
