import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postcss from "postcss";
import postcssImport from "postcss-import";
import { buildVarMap, resolveVarChain } from "./resolve-vars.js";
import type { ParseWarning, ResolvedTheme, TokenEntry, TokenSource, TokenType } from "./types.js";
import { parseV3FromConfigPath } from "./v3.js";

const V4_CSS_CANDIDATES = [
  "app/globals.css",
  "src/app/globals.css",
  "styles/globals.css",
  "src/styles/globals.css",
];

const NAME_PREFIXES: Array<{ pattern: RegExp; type: TokenType; strip: RegExp }> = [
  { pattern: /^--color-/, type: "color", strip: /^--color-/ },
  { pattern: /^--spacing-/, type: "spacing", strip: /^--spacing-/ },
  { pattern: /^--font-size-|^--text-/, type: "fontSize", strip: /^--(font-size-|text-)/ },
  { pattern: /^--font-weight-/, type: "fontWeight", strip: /^--font-weight-/ },
  { pattern: /^--font-family-/, type: "fontFamily", strip: /^--font-family-/ },
  { pattern: /^--font-(?!size|weight|family)/, type: "fontFamily", strip: /^--font-/ },
  { pattern: /^--radius-|^--rounded-/, type: "borderRadius", strip: /^--(radius-|rounded-)/ },
  {
    pattern: /^--leading-|^--line-height-/,
    type: "lineHeight",
    strip: /^--(leading-|line-height-)/,
  },
  {
    pattern: /^--tracking-|^--letter-spacing-/,
    type: "letterSpacing",
    strip: /^--(tracking-|letter-spacing-)/,
  },
  { pattern: /^--shadow-|^--box-shadow-/, type: "boxShadow", strip: /^--(shadow-|box-shadow-)/ },
  { pattern: /^--breakpoint-|^--screen-/, type: "screen", strip: /^--(breakpoint-|screen-)/ },
];

const TYPE_NAMESPACE: Record<TokenType, string> = {
  color: "colors",
  spacing: "spacing",
  fontSize: "fontSize",
  fontFamily: "fontFamily",
  fontWeight: "fontWeight",
  borderRadius: "borderRadius",
  lineHeight: "lineHeight",
  letterSpacing: "letterSpacing",
  boxShadow: "boxShadow",
  screen: "screens",
  other: "other",
};

export async function parseV4(
  cwd: string,
  options: { entry?: string } = {},
): Promise<ResolvedTheme> {
  const entryPath = await findCssEntry(cwd, options.entry);
  if (!entryPath) {
    if (options.entry) {
      throw new Error(`iris: --entry "${options.entry}" not found relative to ${cwd}`);
    }
    throw new Error(`iris: no v4 globals.css found at ${cwd}`);
  }

  const sources = new Set<string>([entryPath]);
  const css = await readFile(entryPath, "utf8");

  const processor = postcss([
    postcssImport({
      filter(url) {
        if (url.startsWith("http")) return false;
        // Skip bare specifiers like @import "tailwindcss" — we only flatten
        // user-authored CSS files; Tailwind's own stylesheet doesn't carry
        // user tokens.
        if (!url.startsWith(".") && !url.startsWith("/")) return false;
        return true;
      },
      async load(filename) {
        sources.add(filename);
        return readFile(filename, "utf8");
      },
    }),
  ]);

  const result = await processor.process(css, { from: entryPath });

  const tokens = new Map<string, TokenEntry>();
  const byValue = new Map<string, TokenEntry[]>();
  const warnings: ParseWarning[] = [];
  const suppressedPrefixes = new Set<string>();

  // Build a var map from every :root / .dark / [data-theme="..."] / @layer
  // base block in the flattened CSS. Used to resolve var() references that
  // shadcn projects routinely have inside @theme inline { --color-bg:
  // var(--bg) }.
  const vars = buildVarMap(result.root);

  result.root.walkAtRules(/^theme$/, (rule) => {
    rule.walkDecls((decl) => {
      const varName = decl.prop;
      const rawValue = decl.value.trim();
      if (!varName.startsWith("--")) return;
      if (rawValue === "initial") {
        // Namespace reset. `--*: initial` wipes everything (empty prefix).
        // `--color-*: initial` wipes the color namespace. A bare name like
        // `--color-red-500: initial` suppresses just that one default.
        if (varName === "--*") {
          suppressedPrefixes.add("");
        } else if (varName.endsWith("-*")) {
          suppressedPrefixes.add(varName.slice(2, -2));
        } else {
          suppressedPrefixes.add(varName.slice(2));
        }
        return;
      }

      const sourceFile = decl.source?.input.from ?? entryPath;
      const resolution = resolveVarChain(rawValue, vars);
      for (const refName of resolution.unresolved) {
        warnings.push({
          kind: "var-unresolved",
          message: `${varName}: var(${refName}) could not be resolved against any :root declaration`,
          file: sourceFile,
        });
      }
      if (resolution.circular) {
        warnings.push({
          kind: "circular-var",
          message: `${varName}: circular var() reference in ${rawValue}`,
          file: sourceFile,
        });
      }
      const value = resolution.value;
      // Infer type from the resolved value — `var(--primary)` would otherwise
      // type as "other"; the resolved oklch(...) types correctly as "color".
      const type = inferType(varName, value);
      const name = canonicalName(varName, type);
      addToken(name, value, type, "v4-theme", sourceFile, tokens, byValue);
    });
  });

  // @config bridge — v4 projects can pull a v3 JS config in via
  // `@config "./tailwind.config.ts"`. Walk those, run the v3 adapter on
  // each target, and merge non-conflicting tokens. CSS @theme entries
  // already in `tokens` win over JS config entries; namespace resets
  // wipe matching bridged tokens too.
  const configBridges = collectConfigBridges(result.root, entryPath);
  for (const configPath of configBridges) {
    try {
      const v3Theme = await parseV3FromConfigPath(configPath);
      mergeBridgedTheme(v3Theme, tokens, byValue, suppressedPrefixes);
      for (const src of v3Theme.sources) sources.add(src);
      for (const w of v3Theme.warnings) warnings.push(w);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push({
        kind: "config-bridge-failed",
        message: `@config bridge failed for ${configPath}: ${message}`,
        file: configPath,
      });
    }
  }

  // Tailwind v4 default theme — seed the defaults the project gets
  // implicitly through `@import "tailwindcss"`. User @theme entries
  // already in `tokens` win over defaults via skip-if-exists; namespace
  // resets wipe matching defaults too.
  if (hasTailwindImport(result.root)) {
    await seedV4Defaults(cwd, tokens, byValue, sources, warnings, suppressedPrefixes);
  }

  return {
    version: 4,
    tokens,
    byValue,
    sources: [...sources].sort(),
    warnings,
    suppressedPrefixes,
  };
}

function isSuppressed(varName: string, suppressed: Set<string>): boolean {
  if (suppressed.size === 0) return false;
  if (suppressed.has("")) return true;
  const stem = varName.startsWith("--") ? varName.slice(2) : varName;
  for (const prefix of suppressed) {
    if (stem === prefix || stem.startsWith(`${prefix}-`)) return true;
  }
  return false;
}

/**
 * Reverse mapping: given a canonical token name like `colors.red-500`, derive
 * the original v3 namespace key (`colors`) and dotted tail (`red-500`) so we
 * can synthesize the equivalent v4 var name (`--color-red-500`) for
 * suppression matching against bridged tokens.
 */
const V3_NS_TO_V4_PREFIX: Record<string, string> = {
  colors: "color",
  spacing: "spacing",
  fontSize: "text",
  fontWeight: "font-weight",
  fontFamily: "font",
  borderRadius: "radius",
  lineHeight: "leading",
  letterSpacing: "tracking",
  boxShadow: "shadow",
  screens: "breakpoint",
};

function bridgedNameSuppressed(canonicalName: string, suppressed: Set<string>): boolean {
  if (suppressed.size === 0) return false;
  if (suppressed.has("")) return true;
  const dot = canonicalName.indexOf(".");
  if (dot < 0) return false;
  const ns = canonicalName.slice(0, dot);
  const tail = canonicalName.slice(dot + 1).replace(/\./g, "-");
  const v4Prefix = V3_NS_TO_V4_PREFIX[ns];
  if (!v4Prefix) return false;
  const synthetic = tail ? `--${v4Prefix}-${tail}` : `--${v4Prefix}`;
  return isSuppressed(synthetic, suppressed);
}

function hasTailwindImport(root: postcss.Root): boolean {
  let found = false;
  root.walkAtRules("import", (rule) => {
    const params = rule.params.trim();
    if (/^['"]tailwindcss['"]$/.test(params) || /^['"]tailwindcss\//.test(params)) {
      found = true;
    }
  });
  return found;
}

async function seedV4Defaults(
  projectRoot: string,
  tokens: Map<string, TokenEntry>,
  byValue: Map<string, TokenEntry[]>,
  sources: Set<string>,
  warnings: ParseWarning[],
  suppressedPrefixes: Set<string>,
): Promise<void> {
  const themeCssPath = locateV4ThemeCss(projectRoot);
  if (!themeCssPath) {
    warnings.push({
      kind: "v4-defaults-not-found",
      message:
        '@import "tailwindcss" is declared but the tailwindcss@4 default theme css could not be located in node_modules; default tokens (red-500, text-sm, p-4, ...) will be missing',
    });
    return;
  }

  try {
    const css = await readFile(themeCssPath, "utf8");
    const root = postcss.parse(css, { from: themeCssPath });
    root.walkAtRules(/^theme$/, (rule) => {
      rule.walkDecls((decl) => {
        const varName = decl.prop;
        const value = decl.value.trim();
        if (!varName.startsWith("--")) return;
        if (value === "initial") return;
        if (isSuppressed(varName, suppressedPrefixes)) return;
        const type = inferType(varName, value);
        const name = canonicalName(varName, type);
        if (tokens.has(name)) return; // user @theme / bridge wins
        addToken(name, value, type, "v4-default", themeCssPath, tokens, byValue);
      });
    });
    sources.add(themeCssPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push({
      kind: "v4-defaults-not-found",
      message: `failed to read tailwindcss default theme at ${themeCssPath}: ${message}`,
      file: themeCssPath,
    });
  }
}

function locateV4ThemeCss(projectRoot: string): string | null {
  // createRequire pinned to a fake module path inside the target project.
  // This makes node resolve `tailwindcss/...` from the project's own
  // node_modules rather than from iris's.
  const targetRequire = createRequire(pathToFileURL(`${projectRoot}/_iris_resolver.js`).href);
  const candidates = ["tailwindcss/theme.css", "tailwindcss/theme/index.css"];
  for (const candidate of candidates) {
    try {
      return targetRequire.resolve(candidate);
    } catch {
      // not present, try next
    }
  }
  return null;
}

function collectConfigBridges(root: postcss.Root, entryPath: string): string[] {
  const paths: string[] = [];
  root.walkAtRules("config", (rule) => {
    const raw = rule.params.trim().replace(/^['"]|['"]$/g, "");
    if (!raw) return;
    const sourceFile = rule.source?.input.from ?? entryPath;
    paths.push(resolve(dirname(sourceFile), raw));
  });
  return paths;
}

function mergeBridgedTheme(
  bridged: ResolvedTheme,
  tokens: Map<string, TokenEntry>,
  byValue: Map<string, TokenEntry[]>,
  suppressedPrefixes: Set<string>,
): void {
  for (const [name, entry] of bridged.tokens) {
    if (tokens.has(name)) continue; // CSS @theme wins
    if (bridgedNameSuppressed(name, suppressedPrefixes)) continue;
    const bridgedEntry: TokenEntry = { ...entry, source: "v4-config-bridge" };
    tokens.set(name, bridgedEntry);
    const list = byValue.get(bridgedEntry.value) ?? [];
    list.push(bridgedEntry);
    byValue.set(bridgedEntry.value, list);
  }
}

async function findCssEntry(cwd: string, override?: string): Promise<string | null> {
  if (override) {
    const abs = resolve(cwd, override);
    try {
      await stat(abs);
      return abs;
    } catch {
      return null;
    }
  }
  for (const rel of V4_CSS_CANDIDATES) {
    const abs = resolve(cwd, rel);
    try {
      await stat(abs);
      return abs;
    } catch {
      // not present
    }
  }
  return null;
}

function inferType(varName: string, value: string): TokenType {
  for (const { pattern, type } of NAME_PREFIXES) {
    if (pattern.test(varName)) return type;
  }
  return inferTypeFromValue(value);
}

function inferTypeFromValue(value: string): TokenType {
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return "color";
  if (/^(oklch|oklab|hsl|hsla|rgb|rgba|color|lab|lch)\s*\(/i.test(value)) return "color";
  if (/^[1-9]00$/.test(value)) return "fontWeight";
  if (/^[\d.]+(rem|em|px|vh|vw|%|ch|ex|pt|pc|cm|mm|in)$/i.test(value)) return "spacing";
  return "other";
}

function canonicalName(varName: string, type: TokenType): string {
  const namespace = TYPE_NAMESPACE[type];
  const matched = NAME_PREFIXES.find((p) => p.pattern.test(varName));
  if (matched) {
    const tail = varName.replace(matched.strip, "");
    return `${namespace}.${tail}`;
  }
  // No prefix match — type was inferred from value (e.g. shadcn's --primary)
  // Strip the leading `--` and use the rest as the token tail.
  const tail = varName.slice(2);
  return `${namespace}.${tail}`;
}

function addToken(
  name: string,
  value: string,
  type: TokenType,
  source: TokenSource,
  file: string,
  tokens: Map<string, TokenEntry>,
  byValue: Map<string, TokenEntry[]>,
): void {
  const entry: TokenEntry = { name, value, type, source, file };
  tokens.set(name, entry);
  const list = byValue.get(value) ?? [];
  list.push(entry);
  byValue.set(value, list);
}
