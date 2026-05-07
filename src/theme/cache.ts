import { readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ParseWarning, ResolvedTheme, TokenEntry } from "./types.js";

type Fingerprint = Record<string, number>;

type SerializedTheme = {
  version: 3 | 4;
  tokens: Array<[string, TokenEntry]>;
  byValue: Array<[string, TokenEntry[]]>;
  sources: string[];
  warnings?: ParseWarning[];
  // Optional for forward-compat: cache entries written before this field
  // existed deserialize to an empty Set, matching the behavior they had at
  // write time (no namespace resets recognized).
  suppressedPrefixes?: string[];
};

type CacheEntry = {
  theme: SerializedTheme;
  fingerprint: Fingerprint;
};

let cacheFilePath = join(tmpdir(), "iris-theme-cache.json");
const memCache = new Map<string, CacheEntry>();

/** For tests — point the disk cache at a controlled file. */
export function setCacheFilePath(path: string): void {
  cacheFilePath = path;
}

export async function getCached(projectRoot: string): Promise<ResolvedTheme | null> {
  const mem = memCache.get(projectRoot);
  if (mem && (await fingerprintMatches(mem.fingerprint))) {
    return deserialize(mem.theme);
  }

  const disk = await loadDiskCache();
  const diskEntry = disk[projectRoot];
  if (diskEntry && (await fingerprintMatches(diskEntry.fingerprint))) {
    memCache.set(projectRoot, diskEntry);
    return deserialize(diskEntry.theme);
  }

  return null;
}

export async function setCached(projectRoot: string, theme: ResolvedTheme): Promise<void> {
  const fingerprint = await computeFingerprint(theme.sources);
  if (!fingerprint) {
    // One of the source files is missing — refuse to cache rather than
    // serving a theme that can never invalidate correctly.
    memCache.delete(projectRoot);
    return;
  }
  const entry: CacheEntry = { theme: serialize(theme), fingerprint };
  memCache.set(projectRoot, entry);

  try {
    const disk = await loadDiskCache();
    disk[projectRoot] = entry;
    await writeFile(cacheFilePath, JSON.stringify(disk));
  } catch {
    // disk cache is best-effort; in-memory still works
  }
}

export async function clearCache(): Promise<void> {
  memCache.clear();
  try {
    await writeFile(cacheFilePath, "{}");
  } catch {
    // ignore
  }
}

async function fingerprintMatches(fp: Fingerprint): Promise<boolean> {
  for (const [path, expectedMtime] of Object.entries(fp)) {
    try {
      const s = await stat(path);
      if (s.mtimeMs !== expectedMtime) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function computeFingerprint(sources: string[]): Promise<Fingerprint | null> {
  const fp: Fingerprint = {};
  for (const path of sources) {
    try {
      const s = await stat(path);
      fp[path] = s.mtimeMs;
    } catch {
      // Any missing source means the cache cannot be trusted to invalidate
      // correctly — refuse to cache this theme.
      return null;
    }
  }
  return fp;
}

async function loadDiskCache(): Promise<Record<string, CacheEntry>> {
  try {
    const raw = await readFile(cacheFilePath, "utf8");
    return JSON.parse(raw) as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

function serialize(theme: ResolvedTheme): SerializedTheme {
  return {
    version: theme.version,
    tokens: [...theme.tokens.entries()],
    byValue: [...theme.byValue.entries()],
    sources: theme.sources,
    warnings: theme.warnings,
    suppressedPrefixes: [...theme.suppressedPrefixes],
  };
}

function deserialize(s: SerializedTheme): ResolvedTheme {
  return {
    version: s.version,
    tokens: new Map(s.tokens),
    byValue: new Map(s.byValue),
    sources: s.sources,
    // Default to [] for cache entries written before the warnings field
    // existed — they pre-date this fix and have no warnings to surface.
    warnings: s.warnings ?? [],
    suppressedPrefixes: new Set(s.suppressedPrefixes ?? []),
  };
}
