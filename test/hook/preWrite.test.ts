import { describe, expect, test } from "vitest";
import { preWrite } from "../../src/hook/preWrite.js";
import type { ShadcnState } from "../../src/shadcn/types.js";
import type { ResolvedTheme, TokenEntry } from "../../src/theme/types.js";

function fakeTheme(entries: Array<Pick<TokenEntry, "name" | "value" | "type">>): ResolvedTheme {
  const tokens = new Map<string, TokenEntry>();
  const byValue = new Map<string, TokenEntry[]>();
  for (const partial of entries) {
    const e: TokenEntry = { source: "v4-theme", file: "test.css", ...partial };
    tokens.set(e.name, e);
    const list = byValue.get(e.value) ?? [];
    list.push(e);
    byValue.set(e.value, list);
  }
  return {
    version: 4,
    tokens,
    byValue,
    sources: ["test.css"],
    warnings: [],
    suppressedPrefixes: new Set(),
  };
}

describe("preWrite hook", () => {
  test("blocks a Write with off-token bg-[#fa8072]", async () => {
    const theme = fakeTheme([{ name: "colors.brand.salmon", value: "#fa8072", type: "color" }]);
    const result = await preWrite(
      {
        tool_name: "Write",
        tool_input: {
          file_path: "Hero.tsx",
          content: '<div className="bg-[#fa8072]" />',
        },
      },
      theme,
    );
    expect(result?.decision).toBe("block");
    expect(result?.reason).toContain("bg-brand-salmon");
  });

  test("allows a clean Write", async () => {
    const theme = fakeTheme([{ name: "colors.muted", value: "#f3f4f6", type: "color" }]);
    const result = await preWrite(
      {
        tool_name: "Write",
        tool_input: { file_path: "Hero.tsx", content: '<div className="bg-muted" />' },
      },
      theme,
    );
    expect(result).toBeNull();
  });

  test("ignores non-JSX file paths", async () => {
    const theme = fakeTheme([]);
    const result = await preWrite(
      {
        tool_name: "Write",
        tool_input: { file_path: "package.json", content: '{"foo":"bar"}' },
      },
      theme,
    );
    expect(result).toBeNull();
  });

  test("Edit with new_string is linted", async () => {
    const theme = fakeTheme([{ name: "colors.brand.salmon", value: "#fa8072", type: "color" }]);
    const result = await preWrite(
      {
        tool_name: "Edit",
        tool_input: {
          file_path: "Hero.tsx",
          old_string: "before",
          new_string: '<div className="bg-[#fa8072]" />',
        },
      },
      theme,
    );
    expect(result?.decision).toBe("block");
  });

  test("MultiEdit lints the union of new_strings", async () => {
    const theme = fakeTheme([{ name: "colors.brand.salmon", value: "#fa8072", type: "color" }]);
    const result = await preWrite(
      {
        tool_name: "MultiEdit",
        tool_input: {
          file_path: "Hero.tsx",
          edits: [
            { old_string: "a", new_string: '<div className="bg-muted" />' },
            { old_string: "b", new_string: '<div className="bg-[#fa8072]" />' },
          ],
        },
      },
      theme,
    );
    expect(result?.decision).toBe("block");
  });

  test("warning-only violations do not block", async () => {
    // no-custom-classname is registered as 'warn' severity in the linter.
    // The hook should let warnings through — only error-severity blocks.
    const theme = fakeTheme([]);
    const result = await preWrite(
      {
        tool_name: "Write",
        tool_input: {
          file_path: "Hero.tsx",
          content: '<div className="bg-totally-fake-token" />',
        },
      },
      theme,
    );
    expect(result).toBeNull();
  });

  test("does NOT block on a shadcn reinvention (warning severity)", async () => {
    // Slice β.2 wires shadcn through to lintSource. The hook deliberately
    // doesn't block warnings; this guards against an accidental severity
    // bump turning a coaching nudge into a hard stop.
    const theme = fakeTheme([]);
    const shadcn: ShadcnState = {
      components: new Map([
        [
          "Button",
          {
            name: "Button",
            filePath: "/proj/components/ui/button.tsx",
            importPath: "@/components/ui/button",
          },
        ],
      ]),
      warnings: [],
    };
    const result = await preWrite(
      {
        tool_name: "Write",
        tool_input: {
          file_path: "Hero.tsx",
          content: "export function Button() { return <button />; }",
        },
      },
      theme,
      shadcn,
    );
    expect(result).toBeNull();
  });
});
