import tsParser from "@typescript-eslint/parser";
import { Linter } from "eslint";
import tailwindPlugin from "eslint-plugin-tailwindcss";
import { DEFAULT_ALLOWLIST, isAllowlisted } from "./allowlist.js";
import { extractClassFromMessage } from "./extract.js";
import type { IrisLintMessage } from "./types.js";

const linter = new Linter({ configType: "flat" });

const config: Linter.FlatConfig[] = [
  {
    files: ["**/*.{ts,tsx,js,jsx,mdx}"],
    languageOptions: {
      // biome-ignore lint/suspicious/noExplicitAny: tsParser type and ESLint Parser type drift across versions; cast at the boundary
      parser: tsParser as any,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      // biome-ignore lint/suspicious/noExplicitAny: plugin lacks first-class flat-config types in 3.x
      tailwindcss: tailwindPlugin as any,
    },
    rules: {
      "tailwindcss/no-arbitrary-value": "error",
    },
  },
];

export async function lintSource(source: string, filename: string): Promise<IrisLintMessage[]> {
  const raw = linter.verify(source, config, { filename });
  const out: IrisLintMessage[] = [];
  for (const m of raw) {
    const msg = toIrisMessage(m);
    if (msg.classname !== undefined && isAllowlisted(msg.classname, DEFAULT_ALLOWLIST)) {
      continue;
    }
    out.push(msg);
  }
  return out;
}

function toIrisMessage(m: Linter.LintMessage): IrisLintMessage {
  const out: IrisLintMessage = {
    ruleId: m.ruleId ?? "unknown",
    severity: m.severity === 2 ? "error" : "warning",
    line: m.line ?? 0,
    column: m.column ?? 0,
    message: m.message,
  };
  if (m.endLine !== undefined) out.endLine = m.endLine;
  if (m.endColumn !== undefined) out.endColumn = m.endColumn;
  const classname = extractClassFromMessage(m.message);
  if (classname !== null) out.classname = classname;
  return out;
}
