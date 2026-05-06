import { resolve as resolvePath } from "node:path";
import { getCached, setCached } from "./cache.js";
import { detectVersion } from "./detect.js";
import type { ParseOptions, ResolvedTheme, TokenEntry } from "./types.js";
import { parseV3 } from "./v3.js";
import { parseV4 } from "./v4.js";

export async function parseTheme(options: ParseOptions = {}): Promise<ResolvedTheme> {
  const cwd = resolvePath(options.cwd ?? process.cwd());
  const entryAbs = options.entry ? resolvePath(cwd, options.entry) : undefined;
  // Composite key — two invocations with the same project root but
  // different --entry overrides must not share a cache entry.
  const cacheKey = entryAbs ? `${cwd}::${entryAbs}` : cwd;

  if (!options.noCache) {
    const cached = await getCached(cacheKey);
    if (cached) return cached;
  }

  const detected = await detectVersion(cwd);
  const theme =
    detected.version === 3
      ? await parseV3(cwd)
      : await parseV4(cwd, options.entry ? { entry: options.entry } : {});

  if (!options.noCache) {
    await setCached(cacheKey, theme);
  }

  return theme;
}

export function lookupByValue(theme: ResolvedTheme, value: string): TokenEntry[] {
  return theme.byValue.get(value) ?? [];
}

export function lookupByName(theme: ResolvedTheme, name: string): TokenEntry | undefined {
  return theme.tokens.get(name);
}
