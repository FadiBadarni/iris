import { describe, expect, test } from "vitest";
import { applyFixes } from "../../src/lint/fix.js";
import type { IrisLintMessage } from "../../src/lint/types.js";

const violation = (overrides: Partial<IrisLintMessage>): IrisLintMessage => ({
  ruleId: "tailwindcss/no-arbitrary-value",
  severity: "error",
  line: 1,
  column: 1,
  message: "Arbitrary value detected in 'bg-[#fa8072]'",
  classname: "bg-[#fa8072]",
  suggestion: { kind: "exact", tokenName: "colors.brand.salmon", replacement: "bg-brand-salmon" },
  ...overrides,
});

describe("applyFixes", () => {
  test("rewrites a single exact-match class in source", () => {
    const source = `<div className="bg-[#fa8072]" />`;
    const out = applyFixes(source, [violation({})]);
    expect(out).toBe(`<div className="bg-brand-salmon" />`);
  });

  test("rewrites a near-match suggestion", () => {
    const source = `<div className="text-[15px]" />`;
    const m = violation({
      classname: "text-[15px]",
      suggestion: { kind: "near", tokenName: "fontSize.sm", replacement: "text-sm", delta: 1 },
    });
    expect(applyFixes(source, [m])).toBe(`<div className="text-sm" />`);
  });

  test("preserves unfixable messages (kind=none, ambiguous, no suggestion)", () => {
    const source = `<div className="bg-[#deadbe]" />`;
    const noSuggestion = violation({
      classname: "bg-[#deadbe]",
      suggestion: { kind: "none" },
    });
    const ambiguous = violation({
      classname: "bg-[#deadbe]",
      suggestion: {
        kind: "ambiguous",
        candidates: [
          { tokenName: "colors.a", replacement: "bg-a" },
          { tokenName: "colors.b", replacement: "bg-b" },
        ],
      },
    });
    expect(applyFixes(source, [noSuggestion])).toBe(source);
    expect(applyFixes(source, [ambiguous])).toBe(source);
  });

  test("applies multiple fixes in one file without offset drift", () => {
    const source = [`<div className="bg-[#fa8072]" />`, `<div className="bg-[#fa8072]" />`].join(
      "\n",
    );
    const m1 = violation({ line: 1, column: 1 });
    const m2 = violation({ line: 2, column: 1 });
    const out = applyFixes(source, [m1, m2]);
    expect(out).toBe(
      [`<div className="bg-brand-salmon" />`, `<div className="bg-brand-salmon" />`].join("\n"),
    );
  });

  test("skips messages without a classname or whose class can't be found", () => {
    const source = `<div className="bg-muted" />`;
    const orphan = violation({ classname: undefined });
    const ghost = violation({ classname: "bg-[#fa8072]" }); // not in source
    expect(applyFixes(source, [orphan, ghost])).toBe(source);
  });
});
