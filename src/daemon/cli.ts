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
import { clearCache as clearThemeCache } from "../theme/cache.js";
import { type DaemonLock, clearLock, isPidAlive, readLock, writeLock } from "./lock.js";
import { createIrisDaemon } from "./server.js";
import { isHealthy } from "./spawn.js";
import { createDaemonWatchers } from "./watchers.js";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

async function main(): Promise<void> {
  // Dispatch by subcommand. The hook spawns `iris-daemon --project-root <p>`
  // (no subcommand → run the daemon). Operators get `status` and `stop`
  // for triage. Subcommand parsing skips known flag-with-value pairs so
  // `iris-daemon --project-root /x status` parses correctly (cmd =
  // "status", projectRoot = /x), and rejects unknown positional args
  // with a usage line so a typo doesn't silently start the daemon.
  const argv = process.argv.slice(2);
  const projectRoot = resolvePath(parseArg("--project-root") ?? process.cwd());
  const cmd = parseSubcommand(argv);

  if (cmd === "status") return await statusCommand(projectRoot);
  if (cmd === "stop") return await stopCommand(projectRoot);
  if (cmd === "") return await runDaemon(projectRoot);

  process.stderr.write(`iris-daemon: unknown command \`${cmd}\`\n`);
  process.stderr.write("usage: iris-daemon [status|stop] [--project-root <path>]\n");
  process.exit(1);
}

function parseSubcommand(argv: readonly string[]): string {
  // Known flags that take a value on the next arg. We skip those pairs
  // when scanning for the positional subcommand.
  const FLAGS_WITH_VALUE = new Set(["--project-root"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (FLAGS_WITH_VALUE.has(a)) {
      i += 1; // skip the value
      continue;
    }
    if (a.startsWith("--")) continue;
    return a;
  }
  return "";
}

async function runDaemon(projectRoot: string): Promise<void> {
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

  // File watchers (slice β). Without these the daemon would hold stale
  // theme/config state until restart whenever the user edited their
  // tailwind config or iris.config. parseTheme has its own mtime cache
  // (cleared via clearThemeCache); parseShadcn has no cache so we don't
  // need a shadcn-watcher branch.
  const watchers = createDaemonWatchers(projectRoot, {
    onThemeChange: () => clearThemeCache(),
    onConfigChange: () => {
      configCache.delete(projectRoot);
    },
  });

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
    await watchers.close();
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

async function statusCommand(projectRoot: string): Promise<void> {
  const lock = await readLock(projectRoot);
  if (!lock) {
    process.stdout.write(`iris-daemon: not running for ${projectRoot}\n`);
    return;
  }
  if (!(await isHealthy(lock))) {
    process.stdout.write(
      `iris-daemon: lock present but stale (pid=${lock.pid}, port=${lock.port}); next iris-hook call will respawn\n`,
    );
    return;
  }
  const startedAt = new Date(lock.startedAt);
  const uptimeS = Math.round((Date.now() - startedAt.getTime()) / 1000);
  process.stdout.write(
    `iris-daemon: running for ${projectRoot}\n` +
      `  pid=${lock.pid}\n` +
      `  port=${lock.port}\n` +
      `  version=${lock.version}\n` +
      `  startedAt=${lock.startedAt}\n` +
      `  uptime=${uptimeS}s\n`,
  );
}

async function stopCommand(projectRoot: string): Promise<void> {
  const lock = await readLock(projectRoot);
  if (!lock) {
    process.stdout.write(`iris-daemon: not running for ${projectRoot}\n`);
    return;
  }
  // Identity check via /health: a stale lock whose PID was reused by an
  // unrelated process must NOT receive our SIGTERM. isHealthy verifies
  // the listener returns the same pid + version as the lock; if it
  // doesn't, we treat the lock as stale and clean up without signaling.
  // Codex 5.5 high flagged the previous "isPidAlive only" check as a
  // BLOCK on the v0.5 γ review.
  if (!(await isHealthy(lock))) {
    await clearLock(projectRoot, lock);
    process.stdout.write(`iris-daemon: cleared stale lock for pid ${lock.pid}\n`);
    return;
  }
  try {
    process.kill(lock.pid, "SIGTERM");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // ESRCH: the process exited between our isHealthy probe and our
    // SIGTERM. Same end state as "already dead" — clear the lock and
    // succeed instead of reporting a false failure.
    if (code === "ESRCH") {
      await clearLock(projectRoot, lock);
      process.stdout.write(`iris-daemon: cleared stale lock for pid ${lock.pid}\n`);
      return;
    }
    process.stderr.write(
      `iris-daemon: failed to signal pid ${lock.pid}: ${
        err instanceof Error ? err.message : String(err)
      }\n`,
    );
    return;
  }
  process.stdout.write(`iris-daemon: SIGTERM sent to pid ${lock.pid}\n`);
  // Wait for the daemon to actually exit. On POSIX, its signal handler
  // runs shutdown() which clears the lock; on Windows SIGTERM is treated
  // as SIGKILL (no handler runs) so the daemon dies without cleaning up
  // its lock — we do it from here once the PID is gone. Either way the
  // post-condition is identical: process gone, lock cleared.
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (!isPidAlive(lock.pid)) {
      await clearLock(projectRoot, lock);
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  process.stderr.write(`iris-daemon: pid ${lock.pid} did not exit within 3s of SIGTERM\n`);
}

function parseArg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

main().catch((err) => {
  process.stderr.write(`iris-daemon: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
