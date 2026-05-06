import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

export type DetectedVersion = {
  version: 3 | 4;
  reason: string;
};

const V4_CSS_CANDIDATES = [
  "app/globals.css",
  "src/app/globals.css",
  "styles/globals.css",
  "src/styles/globals.css",
];

const V3_CONFIG_CANDIDATES = [
  "tailwind.config.ts",
  "tailwind.config.js",
  "tailwind.config.mjs",
  "tailwind.config.cjs",
];

export async function detectVersion(cwd: string): Promise<DetectedVersion> {
  const pkgVersion = await readPackageJsonTailwind(cwd);
  if (pkgVersion === 4) {
    return { version: 4, reason: "package.json declares tailwindcss v4" };
  }
  if (pkgVersion === 3) {
    return { version: 3, reason: "package.json declares tailwindcss v3" };
  }

  for (const rel of V4_CSS_CANDIDATES) {
    const abs = resolve(cwd, rel);
    const css = await tryReadFile(abs);
    if (css === undefined) continue;
    if (looksLikeV4Css(css)) {
      return { version: 4, reason: `${rel} contains @theme or @import "tailwindcss"` };
    }
  }

  for (const rel of V3_CONFIG_CANDIDATES) {
    const abs = resolve(cwd, rel);
    if (await fileExists(abs)) {
      return { version: 3, reason: `found ${rel}` };
    }
  }

  throw new Error(`iris: no tailwind project detected at ${cwd}`);
}

async function readPackageJsonTailwind(cwd: string): Promise<3 | 4 | null> {
  const raw = await tryReadFile(resolve(cwd, "package.json"));
  if (raw === undefined) return null;
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return null;
  }
  const deps = mergeDeps(pkg);
  const spec = deps.tailwindcss;
  if (typeof spec !== "string") return null;
  return parseTailwindMajor(spec);
}

function mergeDeps(pkg: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ["dependencies", "devDependencies", "peerDependencies"] as const) {
    const section = pkg[key];
    if (!section || typeof section !== "object") continue;
    for (const [name, value] of Object.entries(section)) {
      if (typeof value === "string" && !(name in out)) {
        out[name] = value;
      }
    }
  }
  return out;
}

function parseTailwindMajor(spec: string): 3 | 4 | null {
  const match = spec.match(/(\d+)/);
  if (!match) return null;
  const major = Number.parseInt(match[1] ?? "", 10);
  if (major === 3) return 3;
  if (major === 4) return 4;
  return null;
}

function looksLikeV4Css(css: string): boolean {
  if (/@theme\b/.test(css)) return true;
  if (/@import\s+["']tailwindcss["']/.test(css)) return true;
  return false;
}

async function tryReadFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
