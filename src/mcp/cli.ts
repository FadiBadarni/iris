#!/usr/bin/env node
import { createRequire } from "node:module";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseTheme } from "../index.js";
import { createIrisMcpServer } from "./server.js";

const require = createRequire(import.meta.url);

async function main(): Promise<void> {
  const startupCwd = process.cwd();
  const themeCache = new Map<string, Awaited<ReturnType<typeof parseTheme>>>();

  const server = createIrisMcpServer({
    resolveTheme: async (filename, projectRoot) => {
      const root = resolveProjectRoot(filename, projectRoot, startupCwd);
      const cached = themeCache.get(root);
      if (cached) return cached;
      // parseTheme has its own mtime-keyed cache (src/theme/cache.ts), so this
      // map is the daemon-level one — keyed by resolved root rather than cwd
      // so monorepo workspaces don't fight each other.
      const theme = await parseTheme({ cwd: root });
      themeCache.set(root, theme);
      return theme;
    },
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // server.connect resolves once initialized; the transport keeps the
  // process alive until the client disconnects.
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
  // Same walk-up-from-filename as the hook (src/hook/cli.ts). Bounded to 30
  // levels to defeat symlink loops.
  const fs = require("node:fs") as typeof import("node:fs");
  let dir = resolvePath(filePath);
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
