import { describe, expect, test } from "vitest";

describe("public exports", () => {
  test("lintSource is exported from iris main entry", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.lintSource).toBe("function");
  });

  test("IrisLintMessage type is exported", () => {
    // Compile-time check: this file would fail typecheck if the type isn't
    // exported from src/index.ts.
    type _Check = import("../src/index.js").IrisLintMessage;
    const sample: _Check = {
      ruleId: "tailwindcss/no-arbitrary-value",
      severity: "error",
      line: 1,
      column: 1,
      message: "x",
    };
    expect(sample.ruleId).toBe("tailwindcss/no-arbitrary-value");
  });

  test("SuggestResult type is exported", () => {
    type _Check = import("../src/index.js").SuggestResult;
    const sample: _Check = { kind: "none" };
    expect(sample.kind).toBe("none");
  });

  test("lintSource is also reachable via iris/lint subpath", async () => {
    const mod = await import("../src/lint/index.js");
    expect(typeof mod.lintSource).toBe("function");
  });
});
