import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import postcss from "postcss";
import postcssImport from "postcss-import";
import type { ResolvedTheme, TokenEntry, TokenSource, TokenType } from "./types.js";

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

export async function parseV4(cwd: string): Promise<ResolvedTheme> {
  const entryPath = await findCssEntry(cwd);
  if (!entryPath) {
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

  result.root.walkAtRules(/^theme$/, (rule) => {
    rule.walkDecls((decl) => {
      const varName = decl.prop;
      const value = decl.value.trim();
      if (!varName.startsWith("--")) return;
      if (value === "initial") return; // namespace reset — drop matching prefix at lint time

      const type = inferType(varName, value);
      const name = canonicalName(varName, type);
      const sourceFile = decl.source?.input.from ?? entryPath;
      addToken(name, value, type, "v4-theme", sourceFile, tokens, byValue);
    });
  });

  return {
    version: 4,
    tokens,
    byValue,
    sources: [...sources].sort(),
  };
}

async function findCssEntry(cwd: string): Promise<string | null> {
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
