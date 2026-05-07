// Detects shadcn/ui components installed in a project. Mirrors the v0.1
// parseTheme shape: takes a cwd, returns a state object that the rest of
// iris (the lint rule, the MCP tool) consumes without needing to re-walk
// the filesystem. components.json's aliases.ui drives the import-path
// suggestion when present; absent manifest falls back to a project-
// relative path.

import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import fastGlob from "fast-glob";
import type { ShadcnComponent, ShadcnState, ShadcnWarning } from "./types.js";

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
  const files = await fastGlob("**/components/ui/*.{ts,tsx}", {
    cwd,
    absolute: true,
    dot: false,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
  });

  if (files.length === 0) {
    warnings.push({
      kind: "no-shadcn",
      message: `iris: no shadcn/ui components found at ${cwd}. expected components.json or components/ui/*.tsx`,
    });
    return { components: new Map(), warnings };
  }

  const components = new Map<string, ShadcnComponent>();
  for (const filePath of files) {
    const name = componentNameFromFilename(filePath);
    if (!name) continue;
    if (components.has(name)) continue; // first wins (shallower glob result)
    components.set(name, {
      name,
      filePath,
      importPath: buildImportPath(filePath, cwd, uiAlias),
    });
  }

  return { components, warnings };
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
  // Normalize both sides to forward slashes before comparison: fast-glob
  // returns POSIX paths even on Windows, but `resolvePath` returns native
  // separators, so a raw startsWith mismatches and we'd embed the absolute
  // path into the import suggestion.
  const filePosix = filePath.replace(/\\/g, "/");
  const cwdPosix = cwd.replace(/\\/g, "/");
  let rel = filePosix;
  if (rel.toLowerCase().startsWith(cwdPosix.toLowerCase())) {
    rel = rel.slice(cwdPosix.length).replace(/^\/+/, "");
  }
  rel = rel.replace(/\.(ts|tsx)$/i, "");
  return `./${rel}`;
}
