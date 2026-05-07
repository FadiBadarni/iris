import { basename } from "node:path";
import tsParser from "@typescript-eslint/parser";
import { Linter } from "eslint";
import tailwindPlugin from "eslint-plugin-tailwindcss";
import type { ResolvedTheme } from "../theme/types.js";
import { DEFAULT_ALLOWLIST, isAllowlisted } from "./allowlist.js";
import { synthesizeV3Config } from "./config-synth.js";
import { extractClassFromMessage } from "./extract.js";
import { suggestToken } from "./rewrite.js";
import type { IrisLintMessage } from "./types.js";

const linter = new Linter({ configType: "flat" });

// Slice A baseline — runs without a theme. Only no-arbitrary-value, which is
// regex-based and ignores the resolved Tailwind config entirely.
//
// settings.tailwindcss.config is set to an empty object even on this path so
// the plugin doesn't fall back to its filesystem config-discovery and emit
// "Cannot resolve default tailwindcss config path..." to stderr — that
// pollutes CI logs and the future MCP hook's I/O.
const baseConfig: Linter.FlatConfig[] = [
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
    settings: { tailwindcss: { config: {} } },
    rules: {
      "tailwindcss/no-arbitrary-value": "error",
    },
  },
];

// Slice C.2 path — when a theme is provided, layer in no-custom-classname
// against a synthesized Tailwind config so the plugin can validate utilities
// against project tokens + Tailwind defaults.
const themedConfigCache = new WeakMap<ResolvedTheme, Linter.FlatConfig[]>();

function configFor(theme: ResolvedTheme): Linter.FlatConfig[] {
  const cached = themedConfigCache.get(theme);
  if (cached !== undefined) return cached;
  const tailwindConfig = synthesizeV3Config(theme);
  const base = baseConfig[0] as Linter.FlatConfig;
  const cfg: Linter.FlatConfig[] = [
    {
      ...base,
      settings: { tailwindcss: { config: tailwindConfig } },
      rules: {
        "tailwindcss/no-arbitrary-value": "error",
        "tailwindcss/no-custom-classname": "warn",
      },
    },
  ];
  themedConfigCache.set(theme, cfg);
  return cfg;
}

export async function lintSource(
  source: string,
  filename: string,
  theme?: ResolvedTheme,
): Promise<IrisLintMessage[]> {
  const cfg = theme === undefined ? baseConfig : configFor(theme);
  // ESLint's flat-config `files: ["**/*.{ts,tsx,…}"]` glob matches against
  // forward-slash paths and gets confused by absolute paths with drive
  // letters (`C:/Users/…/Hero.tsx`). Pass just the basename — the filename
  // is metadata for ESLint, not a path resolution input. Line/column come
  // from the source content; the caller already knows the original
  // filename and can attach it to the IrisLintMessage downstream.
  const ruleMatchName = basename(filename.replace(/\\/g, "/"));
  const raw = linter.verify(source, cfg, { filename: ruleMatchName });
  const out: IrisLintMessage[] = [];
  for (const m of raw) {
    const msg = toIrisMessage(m, theme);
    if (msg.classname !== undefined && isAllowlisted(msg.classname, DEFAULT_ALLOWLIST)) {
      continue;
    }
    out.push(msg);
  }
  return out;
}

function toIrisMessage(m: Linter.LintMessage, theme?: ResolvedTheme): IrisLintMessage {
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
  if (classname !== null) {
    out.classname = classname;
    if (theme !== undefined) {
      out.suggestion = suggestToken(classname, theme);
    }
  }
  return out;
}
