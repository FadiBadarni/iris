#!/usr/bin/env node
// iris-daemon binary. Long-running process that holds warm parseTheme +
// parseShadcn + loadConfig caches and serves them to the hook over loopback
// HTTP. Spawned by the hook's spawn.ts; idles 10 minutes then exits to free
// resources between Claude Code sessions.
//
// Resolver shape mirrors mcp/cli.ts: in-flight promise coalescing keyed by
// project root (so concurrent calls share a single parse) plus an mtime
// cache inside parseTheme itself for actual freshness. β adds chokidar
// watchers as belt-and-suspenders explicit invalidation; α.2 ships
// without them, relying on parseTheme's own mtime cache (tested in
// theme/cache.test.ts).

import { randomBytes } from "node:crypto";
import { resolve as resolvePath } from "node:path";
import { loadConfig } from "../config/load.js";
import type { IrisConfig } from "../config/types.js";
import { parseTheme, version } from "../index.js";
import { parseShadcn } from "../shadcn/detect.js";
import type { ShadcnState } from "../shadcn/types.js";
import { type DaemonLock, clearLock, writeLock } from "./lock.js";
import { createIrisDaemon } from "./server.js";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

async function main(): Promise<void> {
  const projectRoot = resolvePath(parseArg("--project-root") ?? process.cwd());
  const token = randomBytes(32).toString("hex");
  const startedAt = new Date();

  const inflightTheme = new Map<string, Promise<Awaited<ReturnType<typeof parseTheme>>>>();
  const inflightShadcn = new Map<string, Promise<ShadcnState>>();
  // Sticky-null cache for config. A malformed iris.config shouldn't pound
  // the FS on every /lint request; a daemon restart picks up the fix.
  const configCache = new Map<string, IrisConfig | null>();

  const server = createIrisDaemon({
    resolveTheme: async (_filename, root) => {
      const r = root ? resolvePath(root) : projectRoot;
      const existing = inflightTheme.get(r);
      if (existing) return existing;
      const p = parseTheme({ cwd: r }).finally(() => inflightTheme.delete(r));
      inflightTheme.set(r, p);
      return p;
    },
    resolveShadcn: async (_filename, root) => {
      const r = root ? resolvePath(root) : projectRoot;
      const existing = inflightShadcn.get(r);
      if (existing) return existing;
      const p = parseShadcn({ cwd: r }).finally(() => inflightShadcn.delete(r));
      inflightShadcn.set(r, p);
      return p;
    },
    resolveConfig: async (_filename, root) => {
      const r = root ? resolvePath(root) : projectRoot;
      if (configCache.has(r)) return configCache.get(r) ?? undefined;
      try {
        const cfg = (await loadConfig({ cwd: r })) ?? null;
        configCache.set(r, cfg);
        return cfg ?? undefined;
      } catch (err) {
        process.stderr.write(
          `iris-daemon: failed to load iris.config at ${r} — falling back to defaults: ${
            err instanceof Error ? err.message : String(err)
          }\n`,
        );
        configCache.set(r, null);
        return undefined;
      }
    },
    token,
    version,
    startedAt,
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr === null || typeof addr === "string") {
    process.stderr.write("iris-daemon: failed to bind a loopback port\n");
    process.exit(1);
    return;
  }

  const lock: DaemonLock = {
    pid: process.pid,
    port: addr.port,
    token,
    version,
    startedAt: startedAt.toISOString(),
  };
  await writeLock(projectRoot, lock);

  let idleTimer: NodeJS.Timeout | undefined;
  function resetIdle(): void {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      void shutdown("idle timeout");
    }, IDLE_TIMEOUT_MS);
  }
  // Each request resets the idle timer. Also fires for /health pings, which
  // is correct — a client probing health is signaling intent to use us.
  server.on("request", resetIdle);
  resetIdle();

  let shuttingDown = false;
  async function shutdown(reason: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stderr.write(`iris-daemon: ${reason}\n`);
    if (idleTimer) clearTimeout(idleTimer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Some Node versions expose closeIdleConnections to flush keep-alive
    // sockets that close() alone won't drop until they idle out. Optional
    // chain so older runtimes don't crash on the call.
    (server as unknown as { closeIdleConnections?: () => void }).closeIdleConnections?.();
    // Ownership-checked: only delete the lock if it's still ours, in case
    // a fresh daemon raced past us.
    await clearLock(projectRoot, lock);
    process.exit(0);
  }

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      void shutdown(`received ${sig}`);
    });
  }
  // server.listen resolved already; the http.Server keeps the event loop
  // open until the client disconnects or we close it.
}

function parseArg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

main().catch((err) => {
  process.stderr.write(`iris-daemon: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
