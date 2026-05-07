import { describe, expect, test } from "vitest";
import { formatHuman, formatJson, formatSarif } from "../../src/lint/format.js";
import type { IrisLintMessage } from "../../src/lint/types.js";

const heroMessage: IrisLintMessage = {
  ruleId: "tailwindcss/no-arbitrary-value",
  severity: "error",
  line: 12,
  column: 18,
  message: "Arbitrary value detected in 'bg-[#f3f4f6]'",
  classname: "bg-[#f3f4f6]",
  suggestion: { kind: "exact", tokenName: "colors.muted", replacement: "bg-muted" },
};

const cardMessage: IrisLintMessage = {
  ruleId: "tailwindcss/no-arbitrary-value",
  severity: "error",
  line: 18,
  column: 24,
  message: "Arbitrary value detected in 'text-[15px]'",
  classname: "text-[15px]",
  suggestion: {
    kind: "near",
    tokenName: "fontSize.sm",
    replacement: "text-sm",
    delta: 1,
  },
};

describe("formatHuman", () => {
  test("groups violations under the file path printed once", () => {
    const out = formatHuman([
      {
        filename: "app/Hero.tsx",
        messages: [heroMessage, { ...heroMessage, line: 18, column: 24 }],
      },
    ]);
    const lines = out.trim().split("\n");
    expect(lines[0]).toBe("app/Hero.tsx");
    // Rule out: filename does not appear on every violation line.
    expect(lines.filter((l) => l.includes("app/Hero.tsx"))).toHaveLength(1);
    // Both violation lines reach the output.
    expect(lines.filter((l) => l.match(/^\s+\d+:\d+/))).toHaveLength(2);
  });

  test("renders exact-match suggestion as 'did you mean'", () => {
    const out = formatHuman([{ filename: "Hero.tsx", messages: [heroMessage] }]);
    expect(out).toMatch(/bg-\[#f3f4f6\].+bg-muted/);
    expect(out).toMatch(/did you mean/i);
  });

  test("renders near-match with delta hint", () => {
    const out = formatHuman([{ filename: "Card.tsx", messages: [cardMessage] }]);
    expect(out).toMatch(/text-\[15px\]/);
    expect(out).toMatch(/text-sm/);
  });

  test("emits an empty string for no violations", () => {
    expect(formatHuman([])).toBe("");
    expect(formatHuman([{ filename: "Foo.tsx", messages: [] }])).toBe("");
  });

  test("includes a trailing summary line", () => {
    const warning: IrisLintMessage = { ...heroMessage, severity: "warning" };
    const out = formatHuman([{ filename: "Hero.tsx", messages: [heroMessage, warning] }]);
    expect(out).toMatch(/1 error.+1 warning/);
  });
});

describe("formatJson — envelope", () => {
  test("emits version, tool, files[], summary", () => {
    const out = formatJson([{ filename: "app/Hero.tsx", messages: [heroMessage] }]);
    const parsed = JSON.parse(out);
    expect(parsed.version).toBe("0.1");
    expect(parsed.tool).toBe("iris");
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].path).toBe("app/Hero.tsx");
    expect(parsed.files[0].violations).toHaveLength(1);
    expect(parsed.summary).toEqual({ errorCount: 1, warningCount: 0 });
  });

  test("violation carries classname, line, col, suggestion", () => {
    const out = formatJson([{ filename: "Hero.tsx", messages: [heroMessage] }]);
    const v = JSON.parse(out).files[0].violations[0];
    expect(v.classname).toBe("bg-[#f3f4f6]");
    expect(v.line).toBe(12);
    expect(v.column).toBe(18);
    expect(v.suggestion.replacement).toBe("bg-muted");
  });

  test("emits empty files array on no input", () => {
    const out = formatJson([]);
    const parsed = JSON.parse(out);
    expect(parsed.files).toEqual([]);
    expect(parsed.summary).toEqual({ errorCount: 0, warningCount: 0 });
  });
});

describe("formatSarif — v2.1.0 minimal", () => {
  test("emits version 2.1.0 with one run, tool driver, results", () => {
    const out = formatSarif([{ filename: "app/Hero.tsx", messages: [heroMessage] }]);
    const parsed = JSON.parse(out);
    expect(parsed.version).toBe("2.1.0");
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.runs[0].tool.driver.name).toBe("iris");
    expect(parsed.runs[0].results).toHaveLength(1);
  });

  test("result has ruleId, level, message, physicalLocation", () => {
    const out = formatSarif([{ filename: "app/Hero.tsx", messages: [heroMessage] }]);
    const result = JSON.parse(out).runs[0].results[0];
    expect(result.ruleId).toBe("tailwindcss/no-arbitrary-value");
    expect(result.level).toBe("error");
    expect(result.message.text).toContain("bg-[#f3f4f6]");
    expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe("app/Hero.tsx");
    expect(result.locations[0].physicalLocation.region.startLine).toBe(12);
    expect(result.locations[0].physicalLocation.region.startColumn).toBe(18);
  });

  test("driver.rules contains a unique entry per ruleId", () => {
    const second: IrisLintMessage = {
      ...heroMessage,
      ruleId: "tailwindcss/no-custom-classname",
      message: "Classname 'bg-foo' is not a Tailwind CSS class!",
      classname: "bg-foo",
      suggestion: { kind: "none" },
    };
    const out = formatSarif([{ filename: "Hero.tsx", messages: [heroMessage, second] }]);
    const rules = JSON.parse(out).runs[0].tool.driver.rules;
    expect(rules.map((r: { id: string }) => r.id).sort()).toEqual([
      "tailwindcss/no-arbitrary-value",
      "tailwindcss/no-custom-classname",
    ]);
  });

  test("emits valid SARIF for empty input", () => {
    const out = formatSarif([]);
    const parsed = JSON.parse(out);
    expect(parsed.version).toBe("2.1.0");
    expect(parsed.runs[0].results).toEqual([]);
  });
});
