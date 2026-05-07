#!/usr/bin/env node
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "../config/load.js";
import type { IrisConfig } from "../config/types.js";
import { parseTheme } from "../index.js";
import { parseShadcn } from "../shadcn/detect.js";
import type { ShadcnState } from "../shadcn/types.js";
import { createIrisMcpServer } from "./server.js";

const require = createRequire(import.meta.url);

async function main(): Promise<void> {
  const startupCwd = process.cwd();

  // In-flight promise coalescing keyed by resolved project root. A
  // permanent daemon-level cache for the resolved values would bypass
  // parseTheme's own mtime cache (src/theme/cache.ts) and pin a stale
  // theme until restart — codex 5.5 high flagged that as a real BLOCK
  // during the v0.4 γ review. Inflight maps coalesce concurrent calls
  // for the same root (cheap) and delete on settle, so the next call
  // hits parseTheme/parseShadcn fresh and lets their inner caches
  // judge mtime invalidation themselves.
  const inflightTheme = new Map<string, Promise<Awaited<ReturnType<typeof parseTheme>>>>();
  const inflightShadcn = new Map<string, Promise<ShadcnState>>();

  // Config is different — a malformed config shouldn't pound the FS on
  // every call (daemon, long-lived). Sticky-null cache: tried-and-failed
  // stays null until restart; tried-and-loaded gets returned. Editing a
  // broken config requires daemon restart; that's the v0.4 trade.
  const configCache = new Map<string, IrisConfig | null>();

  const server = createIrisMcpServer({
    resolveTheme: async (filename, projectRoot) => {
      const root = resolveProjectRoot(filename, projectRoot, startupCwd);
      const key = cacheKey(root);
      const existing = inflightTheme.get(key);
      if (existing) return existing;
      const p = parseTheme({ cwd: root }).finally(() => inflightTheme.delete(key));
      inflightTheme.set(key, p);
      return p;
    },
    resolveShadcn: async (filename, projectRoot) => {
      const root = resolveProjectRoot(filename, projectRoot, startupCwd);
      const key = cacheKey(root);
      const existing = inflightShadcn.get(key);
      if (existing) return existing;
      // The same resolver answers lint_source (filename present) and
      // list_components (filename absent — falls back to projectRoot or
      // startupCwd via resolveProjectRoot).
      const p = parseShadcn({ cwd: root }).finally(() => inflightShadcn.delete(key));
      inflightShadcn.set(key, p);
      return p;
    },
    resolveConfig: async (filename, projectRoot) => {
      const root = resolveProjectRoot(filename, projectRoot, startupCwd);
      const key = cacheKey(root);
      if (configCache.has(key)) {
        return configCache.get(key) ?? undefined;
      }
      try {
        const cfg = (await loadConfig({ cwd: root })) ?? null;
        configCache.set(key, cfg);
        return cfg ?? undefined;
      } catch (err) {
        // Log once per project root; cache null so we don't hit the FS
        // on every subsequent tool call. Daemon stays fast, operator
        // sees the error in stderr.
        process.stderr.write(
          `iris-mcp: failed to load iris.config at ${root} — falling back to defaults: ${
            err instanceof Error ? err.message : String(err)
          }\n`,
        );
        configCache.set(key, null);
        return undefined;
      }
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
  filename: string | undefined,
  projectRoot: string | undefined,
  startupCwd: string,
): string {
  if (projectRoot && projectRoot.length > 0) {
    return resolvePath(projectRoot);
  }
  // No filename to anchor on — list_components calls reach here with
  // filename=undefined; fall back to startupCwd so the resolver still
  // points at a sensible root.
  if (!filename) return startupCwd;
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
