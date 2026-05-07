import { describe, expect, test } from "vitest";
import { suggestToken } from "../../src/lint/rewrite.js";
import type { ResolvedTheme, TokenEntry } from "../../src/theme/types.js";

function theme(
  entries: Array<Partial<TokenEntry> & Pick<TokenEntry, "name" | "value" | "type">>,
): ResolvedTheme {
  const tokens = new Map<string, TokenEntry>();
  const byValue = new Map<string, TokenEntry[]>();
  for (const partial of entries) {
    const entry: TokenEntry = {
      source: "v4-theme",
      file: "test.css",
      ...partial,
    };
    tokens.set(entry.name, entry);
    const list = byValue.get(entry.value) ?? [];
    list.push(entry);
    byValue.set(entry.value, list);
  }
  return { version: 4, tokens, byValue, sources: ["test.css"], warnings: [] };
}

describe("suggestToken — exact match", () => {
  test("color exact: bg-[#fa8072] -> bg-brand-salmon", () => {
    const t = theme([{ name: "colors.brand.salmon", value: "#fa8072", type: "color" }]);
    expect(suggestToken("bg-[#fa8072]", t)).toEqual({
      kind: "exact",
      tokenName: "colors.brand.salmon",
      replacement: "bg-brand-salmon",
    });
  });

  test("flat color exact: bg-[#f3f4f6] -> bg-muted", () => {
    const t = theme([{ name: "colors.muted", value: "#f3f4f6", type: "color" }]);
    expect(suggestToken("bg-[#f3f4f6]", t)).toEqual({
      kind: "exact",
      tokenName: "colors.muted",
      replacement: "bg-muted",
    });
  });

  test("fontSize exact: text-[14px] -> text-sm when fontSize.sm = 14px", () => {
    const t = theme([{ name: "fontSize.sm", value: "14px", type: "fontSize" }]);
    expect(suggestToken("text-[14px]", t)).toEqual({
      kind: "exact",
      tokenName: "fontSize.sm",
      replacement: "text-sm",
    });
  });

  test("type filter: bg-[14px] does NOT match fontSize.sm = 14px", () => {
    const t = theme([{ name: "fontSize.sm", value: "14px", type: "fontSize" }]);
    expect(suggestToken("bg-[14px]", t).kind).toBe("none");
  });
});

describe("suggestToken — numeric near match", () => {
  test("text-[15px] -> text-sm when fontSize.sm is 14px (delta 1, threshold 2)", () => {
    const t = theme([{ name: "fontSize.sm", value: "14px", type: "fontSize" }]);
    expect(suggestToken("text-[15px]", t)).toEqual({
      kind: "near",
      tokenName: "fontSize.sm",
      replacement: "text-sm",
      delta: 1,
    });
  });

  test("text-[20px] returns 'none' when no token within 2px", () => {
    const t = theme([{ name: "fontSize.sm", value: "14px", type: "fontSize" }]);
    expect(suggestToken("text-[20px]", t).kind).toBe("none");
  });

  test("rem normalization: text-[14px] matches fontSize.sm = 0.875rem (== 14px)", () => {
    const t = theme([{ name: "fontSize.sm", value: "0.875rem", type: "fontSize" }]);
    const result = suggestToken("text-[14px]", t);
    expect(result.kind).toBe("exact");
    if (result.kind === "exact") expect(result.replacement).toBe("text-sm");
  });

  test("spacing near: p-[15px] -> p-4 when spacing.4 = 16px (delta 1, threshold 4)", () => {
    const t = theme([{ name: "spacing.4", value: "16px", type: "spacing" }]);
    expect(suggestToken("p-[15px]", t)).toEqual({
      kind: "near",
      tokenName: "spacing.4",
      replacement: "p-4",
      delta: 1,
    });
  });

  test("spacing far: p-[100px] returns 'none'", () => {
    const t = theme([{ name: "spacing.4", value: "16px", type: "spacing" }]);
    expect(suggestToken("p-[100px]", t).kind).toBe("none");
  });

  test("colors do not get near-neighbor in slice C.1", () => {
    const t = theme([{ name: "colors.brand.salmon", value: "#fa8072", type: "color" }]);
    expect(suggestToken("bg-[#fa8073]", t).kind).toBe("none");
  });
});

describe("suggestToken — ambiguous", () => {
  test("two tokens with same value -> ambiguous, ordered by tail length then source", () => {
    const t = theme([
      { name: "colors.background", value: "#f3f4f6", type: "color", source: "v4-default" },
      { name: "colors.muted", value: "#f3f4f6", type: "color", source: "v4-theme" },
    ]);
    const result = suggestToken("bg-[#f3f4f6]", t);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      // Shortest token tail first (`muted` < `background`); among equal length,
      // source precedence v4-theme > v4-config-bridge > v4-default
      expect(result.candidates).toEqual([
        { tokenName: "colors.muted", replacement: "bg-muted" },
        { tokenName: "colors.background", replacement: "bg-background" },
      ]);
    }
  });
});

describe("suggestToken — none", () => {
  test("non-arbitrary class returns 'none'", () => {
    const t = theme([]);
    expect(suggestToken("bg-muted", t).kind).toBe("none");
  });

  test("empty theme returns 'none' for any class", () => {
    const t = theme([]);
    expect(suggestToken("bg-[#fa8072]", t).kind).toBe("none");
  });
});
