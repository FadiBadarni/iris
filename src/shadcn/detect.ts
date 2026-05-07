// Detects shadcn/ui components installed in a project. Mirrors the v0.1
// parseTheme shape: takes a cwd, returns a state object that the rest of
// iris (the lint rule, the MCP tool) consumes without needing to re-walk
// the filesystem. components.json's aliases.ui drives the import-path
// suggestion when present; absent manifest falls back to a project-
// relative path.

import { readFile } from "node:fs/promises";
import { dirname, relative as relativePath, resolve as resolvePath } from "node:path";
import fastGlob from "fast-glob";
import type { ShadcnComponent, ShadcnState, ShadcnWarning } from "./types.js";

// Filenames that look like component paths but aren't components: barrel
// files, colocated tests/specs/stories, type declarations. The codex 5.5
// review flagged that without this filter `index.tsx` would surface as an
// "Index" component and `button.test.tsx` as "Button.test", polluting the
// MCP inventory and causing false-positive lint reports.
const NON_COMPONENT_STEMS = /^(index)$|\.(test|spec|stories|d)$/i;

export type ParseShadcnOptions = {
  cwd?: string;
  components?: string;
};

type ComponentsManifest = {
  aliases?: { ui?: string };
};

export async function parseShadcn(options: ParseShadcnOptions = {}): Promise<ShadcnState> {
  const cwd = resolvePath(options.cwd ?? process.cwd());
  const warnings: ShadcnWarning[] = [];
  const manifestPath =
    options.components !== undefined
      ? resolvePath(cwd, options.components)
      : resolvePath(cwd, "components.json");

  const manifest = await readManifest(manifestPath);
  const uiAlias = manifest?.aliases?.ui ?? null;

  // Glob first — works whether or not the manifest is present. The manifest
  // narrows the alias prefix the import path uses; the file walk is the
  // source of truth for what's actually installed.
  const rawFiles = await fastGlob("**/components/ui/*.{ts,tsx}", {
    cwd,
    absolute: true,
    dot: false,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
  });

  // Sort by depth-then-lex so monorepo dirs surface in a deterministic
  // order: the shallowest `components/ui` directory wins by default.
  // Without this the order is fast-glob's internal walk, which is fast but
  // not contractually stable across versions.
  const files = rawFiles.slice().sort(byDepthThenLex);

  // Surface a multi-shadcn warning when more than one distinct
  // `components/ui` directory exists under cwd. The first (shallowest)
  // wins; the others are reported so users with monorepos know they need
  // a workspace-scoped manifest or a future iris.config.ts to disambiguate.
  const uiDirs = new Set(files.map((f) => dirname(f.replace(/\\/g, "/"))));
  if (uiDirs.size > 1) {
    const sorted = [...uiDirs].sort(byDepthThenLex);
    warnings.push({
      kind: "multi-shadcn",
      message: `iris: multiple shadcn components/ui directories at ${cwd}. using ${sorted[0]}; ignoring ${sorted.slice(1).join(", ")}`,
    });
  }
  const winningDir = uiDirs.size > 0 ? [...uiDirs].sort(byDepthThenLex)[0] : null;

  const filtered =
    winningDir === null
      ? files
      : files.filter((f) => dirname(f.replace(/\\/g, "/")) === winningDir);

  if (filtered.length === 0) {
    warnings.push({
      kind: "no-shadcn",
      message: `iris: no shadcn/ui components found at ${cwd}. expected components.json or components/ui/*.tsx`,
    });
    return { components: new Map(), warnings };
  }

  const components = new Map<string, ShadcnComponent>();
  for (const filePath of filtered) {
    const name = componentNameFromFilename(filePath);
    if (!name) continue;
    if (components.has(name)) continue; // first wins after deterministic sort
    components.set(name, {
      name,
      filePath,
      importPath: buildImportPath(filePath, cwd, uiAlias),
    });
  }

  if (components.size === 0) {
    warnings.push({
      kind: "no-shadcn",
      message: `iris: no shadcn/ui components found at ${cwd}. expected components.json or components/ui/*.tsx`,
    });
  }

  return { components, warnings };
}

function byDepthThenLex(a: string, b: string): number {
  const na = a.replace(/\\/g, "/");
  const nb = b.replace(/\\/g, "/");
  const da = (na.match(/\//g) ?? []).length;
  const db = (nb.match(/\//g) ?? []).length;
  if (da !== db) return da - db;
  return na.localeCompare(nb);
}

async function readManifest(path: string): Promise<ComponentsManifest | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as ComponentsManifest;
  } catch {
    return null;
  }
}

function componentNameFromFilename(filePath: string): string | null {
  const base = filePath.split(/[/\\]/).pop() ?? "";
  const stem = base.replace(/\.(ts|tsx)$/i, "");
  if (!stem) return null;
  // Skip barrels, colocated tests/specs/stories, and type declarations.
  // Real shadcn projects often colocate these alongside the actual
  // components; without the filter `index.tsx` would surface as "Index"
  // and `button.test.tsx` as "Button.test".
  if (NON_COMPONENT_STEMS.test(stem)) return null;
  // shadcn files are kebab-case (e.g. button, alert-dialog). Convert to
  // PascalCase: alert-dialog → AlertDialog. Single-segment names are
  // simply capitalized: button → Button.
  return stem
    .split("-")
    .map((seg) => (seg ? (seg[0]?.toUpperCase() ?? "") + seg.slice(1) : seg))
    .join("");
}

function buildImportPath(filePath: string, cwd: string, uiAlias: string | null): string {
  const stem = (filePath.split(/[/\\]/).pop() ?? "").replace(/\.(ts|tsx)$/i, "");
  // When the manifest declares aliases.ui (e.g. "@/components/ui"), use it
  // verbatim as the prefix and append the file's stem. Otherwise fall back
  // to a project-relative path so the suggestion still resolves at the
  // CWD root even without alias config.
  if (uiAlias && stem) {
    return `${uiAlias.replace(/\/+$/, "")}/${stem}`;
  }
  // Use Node's path.relative which handles drive letters, separators, and
  // boundary cases (e.g. `cwd=C:/repo/app` vs `filePath=C:/repo/application/...`
  // — a naive startsWith would match the prefix and produce a broken
  // `./lication/...` import). If the result escapes the cwd (`..`) or is
  // absolute, fall back to a sentinel rather than emit a wrong path.
  const rel = relativePath(cwd, filePath).replace(/\\/g, "/");
  if (rel.startsWith("..") || /^[a-zA-Z]:/.test(rel)) {
    // Path is outside cwd — return a degraded but honest absolute path so
    // the suggestion is at least correct, even if not local-import-friendly.
    return filePath.replace(/\\/g, "/").replace(/\.(ts|tsx)$/i, "");
  }
  return `./${rel.replace(/\.(ts|tsx)$/i, "")}`;
}
