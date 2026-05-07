#!/usr/bin/env node
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseTheme } from "../index.js";
import { parseShadcn } from "../shadcn/detect.js";
import type { ShadcnState } from "../shadcn/types.js";
import { createIrisMcpServer } from "./server.js";

const require = createRequire(import.meta.url);

async function main(): Promise<void> {
  const startupCwd = process.cwd();
  const themeCache = new Map<string, Awaited<ReturnType<typeof parseTheme>>>();
  const shadcnCache = new Map<string, ShadcnState>();

  const server = createIrisMcpServer({
    resolveTheme: async (filename, projectRoot) => {
      const root = resolveProjectRoot(filename, projectRoot, startupCwd);
      const key = cacheKey(root);
      const cached = themeCache.get(key);
      if (cached) return cached;
      // parseTheme has its own mtime-keyed cache (src/theme/cache.ts), so this
      // map is the daemon-level one — keyed by resolved root rather than cwd
      // so monorepo workspaces don't fight each other.
      const theme = await parseTheme({ cwd: root });
      themeCache.set(key, theme);
      return theme;
    },
    resolveShadcn: async (filename, projectRoot) => {
      const root = resolveProjectRoot(filename, projectRoot, startupCwd);
      const key = cacheKey(root);
      const cached = shadcnCache.get(key);
      if (cached) return cached;
      // parseShadcn does its own filesystem walk on every call — cheap
      // enough that not bothering with mtime invalidation, but expensive
      // enough that a daemon-level cache by root pays off across calls.
      const shadcn = await parseShadcn({ cwd: root });
      shadcnCache.set(key, shadcn);
      return shadcn;
    },
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Close the transport on shutdown so any in-flight cache writes flush. The
  // theme cache is JSON-serialized to disk via writeFile (not atomic) — a
  // raw SIGTERM mid-write would leave a half-written file.
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      server.close().finally(() => process.exit(0));
    });
  }
  // server.connect resolves once initialized; the transport keeps the
  // process alive until the client disconnects.
}

function cacheKey(root: string): string {
  // Windows file paths are case-insensitive (NTFS by default). `C:\Repo` and
  // `c:\repo` resolve to the same theme; without normalization a daemon
  // would parse twice and risk stale entries. Linux/macOS paths stay
  // case-sensitive.
  return process.platform === "win32" ? root.toLowerCase() : root;
}

function resolveProjectRoot(
  filename: string,
  projectRoot: string | undefined,
  startupCwd: string,
): string {
  if (projectRoot && projectRoot.length > 0) {
    return resolvePath(projectRoot);
  }
  const absoluteFilename = isAbsolute(filename) ? filename : resolvePath(startupCwd, filename);
  const found = findProjectRoot(absoluteFilename);
  if (found) return found;
  return startupCwd;
}

function findProjectRoot(filePath: string): string | null {
  // Walk up from the file's *directory* (not the file itself — the first
  // iteration would otherwise stat `<file>/package.json` and waste a step).
  // Bounded to 30 levels to defeat symlink loops.
  const fs = require("node:fs") as typeof import("node:fs");
  let dir = dirname(resolvePath(filePath));
  for (let i = 0; i < 30; i++) {
    try {
      fs.statSync(resolvePath(dir, "package.json"));
      return dir;
    } catch {
      const parent = resolvePath(dir, "..");
      if (parent === dir) return null;
      dir = parent;
    }
  }
  return null;
}

main().catch((err) => {
  // MCP supervisors expect a non-zero exit on startup failure so they can
  // surface the error rather than silently treating iris as healthy.
  process.stderr.write(`iris-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
