import { stat } from "node:fs/promises";
import Module, { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import type { Config } from "tailwindcss";
import type { ResolvedTheme, TokenEntry, TokenSource, TokenType } from "./types.js";

const require = createRequire(import.meta.url);
type ResolveConfigFn = <T extends Config>(config: T) => Config;
const resolveConfig = require("tailwindcss/resolveConfig") as ResolveConfigFn;

const TIMEOUT_MS = 3000;

const V3_CONFIG_CANDIDATES = [
  "tailwind.config.ts",
  "tailwind.config.js",
  "tailwind.config.mjs",
  "tailwind.config.cjs",
];

const TYPE_MAP: Record<string, TokenType> = {
  colors: "color",
  spacing: "spacing",
  fontSize: "fontSize",
  fontFamily: "fontFamily",
  fontWeight: "fontWeight",
  borderRadius: "borderRadius",
  lineHeight: "lineHeight",
  letterSpacing: "letterSpacing",
  boxShadow: "boxShadow",
  screens: "screen",
};

const TRACKED_EXTENSIONS = [".ts", ".js", ".mjs", ".cjs", ".tsx", ".jsx"];

export async function parseV3(cwd: string): Promise<ResolvedTheme> {
  const configPath = await findConfigPath(cwd);
  if (!configPath) {
    throw new Error(`iris: no tailwind.config.{ts,js,mjs,cjs} found at ${cwd}`);
  }

  const sources = new Set<string>([configPath]);
  const restoreHook = installResolveHook(sources, cwd);

  let userConfig: Config;
  try {
    const jiti = createJiti(pathToFileURL(`${cwd}/`).href, { interopDefault: true });
    const loaded = await raceTimeout(
      jiti.import<unknown>(configPath),
      TIMEOUT_MS,
      `iris: tailwind.config evaluation timed out after ${TIMEOUT_MS}ms`,
    );
    userConfig = extractDefault(loaded);
  } finally {
    restoreHook();
  }

  const resolved = resolveConfig(userConfig);
  const tokens = new Map<string, TokenEntry>();
  const byValue = new Map<string, TokenEntry[]>();
  walkTheme(resolved.theme as Record<string, unknown>, configPath, tokens, byValue);

  return {
    version: 3,
    tokens,
    byValue,
    sources: [...sources].sort(),
    warnings: [],
  };
}

async function findConfigPath(cwd: string): Promise<string | null> {
  for (const rel of V3_CONFIG_CANDIDATES) {
    const abs = resolve(cwd, rel);
    try {
      await stat(abs);
      return abs;
    } catch {
      // not present, keep looking
    }
  }
  return null;
}

type ResolveFn = (
  request: string,
  parent: NodeJS.Module | undefined,
  isMain?: boolean,
  options?: unknown,
) => string;

function installResolveHook(sources: Set<string>, cwd: string): () => void {
  const moduleAny = Module as unknown as { _resolveFilename: ResolveFn };
  const original = moduleAny._resolveFilename;
  moduleAny._resolveFilename = function patched(this: unknown, request, parent, isMain, options) {
    const resolved = original.call(this, request, parent, isMain, options);
    if (
      typeof resolved === "string" &&
      !resolved.includes(`${"node_modules"}`) &&
      resolved.startsWith(cwd) &&
      TRACKED_EXTENSIONS.some((ext) => resolved.endsWith(ext))
    ) {
      sources.add(resolved);
    }
    return resolved;
  };
  return () => {
    moduleAny._resolveFilename = original;
  };
}

function extractDefault(loaded: unknown): Config {
  if (loaded && typeof loaded === "object" && "default" in loaded) {
    return (loaded as { default: Config }).default;
  }
  return loaded as Config;
}

function raceTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolveOuter, rejectOuter) => {
    const timer = setTimeout(() => rejectOuter(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolveOuter(value);
      },
      (err) => {
        clearTimeout(timer);
        rejectOuter(err);
      },
    );
  });
}

function walkTheme(
  theme: Record<string, unknown>,
  file: string,
  tokens: Map<string, TokenEntry>,
  byValue: Map<string, TokenEntry[]>,
): void {
  // Tailwind v3's default theme has many keys that inherit from `colors`
  // (accentColor, backgroundColor, borderColor, fill, stroke, etc.) and from
  // `spacing` (gap, padding, margin, inset, ...). Walking those would pollute
  // byValue with duplicate entries pointing at non-canonical names. We walk
  // only the canonical token namespaces — everything else inherits at lint
  // time from these.
  for (const [topKey, topValue] of Object.entries(theme)) {
    const type = TYPE_MAP[topKey];
    if (!type) continue;
    walkValue([topKey], topValue, type, file, tokens, byValue);
  }
}

function walkValue(
  path: string[],
  value: unknown,
  type: TokenType,
  file: string,
  tokens: Map<string, TokenEntry>,
  byValue: Map<string, TokenEntry[]>,
): void {
  if (typeof value === "string") {
    addToken(path.join("."), value, type, "v3-config", file, tokens, byValue);
    return;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "string") {
      addToken(path.join("."), first, type, "v3-config", file, tokens, byValue);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, sub] of Object.entries(value)) {
      if (key === "DEFAULT") {
        walkValue(path, sub, type, file, tokens, byValue);
      } else {
        walkValue([...path, key], sub, type, file, tokens, byValue);
      }
    }
  }
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
