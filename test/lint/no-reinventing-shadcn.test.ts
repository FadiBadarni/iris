import { basename } from "node:path";
import tsParser from "@typescript-eslint/parser";
import { type Linter, Linter as LinterCtor } from "eslint";
import { describe, expect, test } from "vitest";
import { noReinventingShadcn } from "../../src/lint/rules/no-reinventing-shadcn.js";
import type { ShadcnState } from "../../src/shadcn/types.js";

function fakeShadcn(
  entries: Array<{ name: string; filePath: string; importPath: string }>,
): ShadcnState {
  return { components: new Map(entries.map((e) => [e.name, e])), warnings: [] };
}

// Mirror lintSource's two-channel filename pattern so the rule sees the same
// shape it sees in production: `filename` is a basename (so ESLint's
// flat-config glob engages even for absolute paths) and `physicalFilename`
// carries the full path the rule compares against ShadcnComponent.filePath.
function lint(source: string, filePath: string, shadcn: ShadcnState): Linter.LintMessage[] {
  const linter = new LinterCtor({ configType: "flat" });
  return linter.verify(
    source,
    [
      {
        files: ["**/*.{ts,tsx,js,jsx}", "*.{ts,tsx,js,jsx}"],
        languageOptions: {
          // biome-ignore lint/suspicious/noExplicitAny: parser type drift
          parser: tsParser as any,
          parserOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            ecmaFeatures: { jsx: true },
          },
        },
        plugins: {
          // biome-ignore lint/suspicious/noExplicitAny: rule-shape interop
          iris: { rules: { "no-reinventing-shadcn": noReinventingShadcn(shadcn) } } as any,
        },
        rules: { "iris/no-reinventing-shadcn": "warn" },
      },
    ],
    // biome-ignore lint/suspicious/noExplicitAny: physicalFilename missing from LintOptions type
    { filename: basename(filePath), physicalFilename: filePath } as any,
  );
}

describe("iris/no-reinventing-shadcn", () => {
  const buttonComponent = {
    name: "Button",
    filePath: "/proj/components/ui/button.tsx",
    importPath: "@/components/ui/button",
  };
  const shadcn = fakeShadcn([buttonComponent]);

  test("fires on a function declaration named after a shadcn component", () => {
    const src = "export function Button({ children }) { return <button>{children}</button>; }";
    const msgs = lint(src, "Hero.tsx", shadcn);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.ruleId).toBe("iris/no-reinventing-shadcn");
    expect(msgs[0]?.message).toContain("@/components/ui/button");
    expect(msgs[0]?.severity).toBe(1); // 1 = warn in ESLint
  });

  test("fires on an arrow function const", () => {
    const src = "const Card = ({ children }) => <div>{children}</div>;";
    const msgs = lint(
      src,
      "Hero.tsx",
      fakeShadcn([
        {
          name: "Card",
          filePath: "/proj/components/ui/card.tsx",
          importPath: "@/components/ui/card",
        },
      ]),
    );
    expect(msgs).toHaveLength(1);
  });

  test("does NOT fire on the canonical file", () => {
    const src = "export function Button() { return <button />; }";
    const msgs = lint(src, "/proj/components/ui/button.tsx", shadcn);
    expect(msgs).toEqual([]);
  });

  test("does NOT fire when the file already imports the component", () => {
    const src = `import { Button } from "@/components/ui/button";\nfunction Wrapper() { return <Button />; }`;
    const msgs = lint(src, "Hero.tsx", shadcn);
    expect(msgs).toEqual([]);
  });

  test("does NOT fire on unrelated function names", () => {
    const src = "function MyHero() { return <div />; }";
    const msgs = lint(src, "Hero.tsx", shadcn);
    expect(msgs).toEqual([]);
  });

  test("fires on a forwardRef wrapper (the shadcn-canonical shape)", () => {
    // shadcn's own components ship as `forwardRef(...)`. If the rule only
    // walked ArrowFunctionExpression initializers it'd miss the most
    // common AI-generation pattern this rule is here to catch.
    const src = `import { forwardRef } from "react";\nconst Button = forwardRef((props, ref) => <button ref={ref} {...props} />);`;
    const msgs = lint(src, "Hero.tsx", shadcn);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.message).toContain("@/components/ui/button");
  });

  test("fires on a default-exported function declaration", () => {
    const src = "export default function Button() { return <button />; }";
    const msgs = lint(src, "Hero.tsx", shadcn);
    expect(msgs).toHaveLength(1);
  });

  test("does NOT count type-only imports as canonical (still fires on a value redefinition)", () => {
    // `import type { Button }` doesn't bring the value in — the local
    // Button function below is still a reinvention.
    const src = `import type { Button } from "@/components/ui/button";\nfunction Button() { return <button />; }`;
    const msgs = lint(src, "Hero.tsx", shadcn);
    expect(msgs).toHaveLength(1);
  });
});
