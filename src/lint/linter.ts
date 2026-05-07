import { basename } from "node:path";
import tsParser from "@typescript-eslint/parser";
import { Linter } from "eslint";
import tailwindPlugin from "eslint-plugin-tailwindcss";
import type { IrisConfig } from "../config/types.js";
import type { ShadcnState } from "../shadcn/types.js";
import type { ResolvedTheme } from "../theme/types.js";
import { type AllowlistPattern, DEFAULT_ALLOWLIST, isAllowlisted } from "./allowlist.js";
import { synthesizeV3Config } from "./config-synth.js";
import { extractClassFromMessage } from "./extract.js";
import { suggestToken } from "./rewrite.js";
import { noReinventingShadcn } from "./rules/no-reinventing-shadcn.js";
import type { IrisLintMessage } from "./types.js";

const linter = new Linter({ configType: "flat" });

// Slice A baseline — runs without a theme. Only no-arbitrary-value, which is
// regex-based and ignores the resolved Tailwind config entirely.
//
// settings.tailwindcss.config is set to an empty object even on this path so
// the plugin doesn't fall back to its filesystem config-discovery and emit
// "Cannot resolve default tailwindcss config path..." to stderr — that
// pollutes CI logs and the future MCP hook's I/O.
// `files:` is required to engage the parser — without it ESLint flat
// config falls through and reports "no matching configuration." The
// pattern below matches both relative paths (`Hero.tsx`) and absolute
// forward-slash paths the v0.3 shadcn rule needs (`C:/Users/…/Hero.tsx`).
// Forward-slash normalization happens at the boundary in `lintSource`.
const baseConfig: Linter.FlatConfig[] = [
  {
    files: ["**/*.{ts,tsx,js,jsx,mdx}", "*.{ts,tsx,js,jsx,mdx}"],
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

// Slice β.2 path — when a ShadcnState is provided, layer in
// iris/no-reinventing-shadcn as an independent flat-config entry. The rule
// is theme-orthogonal (it only consults the AST + the ShadcnState), so it
// composes cleanly with both the base and themed configs by being appended
// rather than merged into the existing entry.
const shadcnLayerCache = new WeakMap<ShadcnState, Linter.FlatConfig>();

function shadcnLayer(shadcn: ShadcnState): Linter.FlatConfig {
  const cached = shadcnLayerCache.get(shadcn);
  if (cached !== undefined) return cached;
  const layer: Linter.FlatConfig = {
    files: ["**/*.{ts,tsx,js,jsx,mdx}", "*.{ts,tsx,js,jsx,mdx}"],
    plugins: {
      // biome-ignore lint/suspicious/noExplicitAny: rule-shape interop
      iris: { rules: { "no-reinventing-shadcn": noReinventingShadcn(shadcn) } } as any,
    },
    rules: { "iris/no-reinventing-shadcn": "warn" },
  };
  shadcnLayerCache.set(shadcn, layer);
  return layer;
}

export async function lintSource(
  source: string,
  filename: string,
  theme?: ResolvedTheme,
  shadcn?: ShadcnState,
  config?: IrisConfig,
): Promise<IrisLintMessage[]> {
  const baseLayers = theme === undefined ? baseConfig : configFor(theme);
  const cfg = shadcn === undefined ? baseLayers : [...baseLayers, shadcnLayer(shadcn)];
  // Two-channel filename: `filename` is the basename so ESLint's
  // flat-config glob (`**/*.{ts,tsx,…}`) engages even for Windows-absolute
  // paths with drive letters that the glob can't match. `physicalFilename`
  // carries the full forward-slash path through to rules that need it
  // (v0.3 shadcn canonical-file suppression compares against
  // ShadcnComponent.filePath).
  const fullFilename = filename.replace(/\\/g, "/");
  const ruleMatchName = basename(fullFilename);
  // ESLint accepts `physicalFilename` at runtime and forwards it to rule
  // contexts, but @types/eslint's LintOptions doesn't expose it. Cast at the
  // boundary so the v0.3 shadcn rule can read the full path.
  const raw = linter.verify(source, cfg, {
    filename: ruleMatchName,
    physicalFilename: fullFilename,
    // biome-ignore lint/suspicious/noExplicitAny: physicalFilename missing from LintOptions type
  } as any);

  // User config: pre-compile allowlist regexes once and resolve the rule
  // override map for cheap per-message lookup. Both default to no-op when
  // the caller didn't pass a config.
  const allowlistPatterns = combineAllowlist(config);
  const ruleOverrides = config?.rules ?? {};

  const out: IrisLintMessage[] = [];
  for (const m of raw) {
    // Look up the override against the ESLint ruleId, NOT toIrisMessage's
    // "unknown" presentation fallback — otherwise `rules: { unknown: "off" }`
    // would silence every parser/internal diagnostic ESLint emits without
    // a ruleId. Codex 5.5 high flagged this on the v0.4 α review.
    const override =
      m.ruleId !== null && m.ruleId !== undefined ? ruleOverrides[m.ruleId] : undefined;
    if (override === "off") continue;
    const msg = toIrisMessage(m, theme);
    if (override === "warn") msg.severity = "warning";
    else if (override === "error") msg.severity = "error";
    if (msg.classname !== undefined && isAllowlisted(msg.classname, allowlistPatterns)) {
      continue;
    }
    out.push(msg);
  }
  return out;
}

function combineAllowlist(config: IrisConfig | undefined): AllowlistPattern[] {
  const extras = config?.allowlist;
  if (!extras || extras.length === 0) return DEFAULT_ALLOWLIST;
  const compiled: AllowlistPattern[] = [];
  for (const p of extras) {
    if (p instanceof RegExp) {
      // Strip `g` / `y` flags: they make `RegExp.prototype.test` stateful
      // via `lastIndex`, so repeated calls (we test every classname on
      // every lint pass) would alternate between matching and missing.
      const flags = p.flags.replace(/[gy]/g, "");
      compiled.push(flags === p.flags ? p : new RegExp(p.source, flags));
    } else {
      compiled.push(new RegExp(p));
    }
  }
  return [...DEFAULT_ALLOWLIST, ...compiled];
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
