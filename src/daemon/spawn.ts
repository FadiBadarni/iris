// Detect-or-spawn the iris-daemon for a project root. The hook calls
// `getOrSpawnDaemon` and gets back a live `DaemonLock` it can talk to —
// either the existing one (warm path, ~ms) or a freshly-spawned one
// (cold path, ~500ms one-time).
//
// Concurrency: a `.iris/spawn.lock` sentinel file is created with O_EXCL
// before spawning. If two hook calls race, the loser sees `EEXIST`, polls
// until the lock file appears, and uses the winner's daemon. Sentinel
// is always cleared in `finally` so a crashed spawn doesn't permanently
// block subsequent attempts.

import { type ChildProcess, spawn as spawnChild } from "node:child_process";
import { mkdir, open, rm } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { type DaemonLock, clearLock, isPidAlive, readLock } from "./lock.js";

const SPAWN_SENTINEL = ".iris/spawn.lock";
const SPAWN_TIMEOUT_MS = 5_000;
const HEALTH_TIMEOUT_MS = 500;
const POLL_INTERVAL_MS = 50;

export type SpawnOptions = {
  /** Override the daemon binary path (tests). Defaults to dist/daemon/cli.js. */
  daemonBin?: string;
  /** iris-cc version that the running daemon must match — mismatches force a respawn. */
  expectedVersion?: string;
  /** Override the spawn function (tests). */
  spawnImpl?: (cmd: string, args: string[], options: unknown) => ChildProcess;
};

export async function getOrSpawnDaemon(
  projectRoot: string,
  opts: SpawnOptions = {},
): Promise<DaemonLock> {
  const existing = await readLock(projectRoot);
  if (existing) {
    if (await isHealthy(existing, opts.expectedVersion)) return existing;
    // Stale lock (PID gone, port unreachable, version mismatch). Clear
    // it so the spawn-sentinel branch can write a fresh one. Use the
    // ownership-checked variant: if a fresh daemon raced past us between
    // our readLock and now, leave its lock alone — the wait/spawn branch
    // below will pick it up via the loop.
    await clearLock(projectRoot, existing);
  }

  const sentinelFile = resolvePath(projectRoot, SPAWN_SENTINEL);
  // Ensure .iris/ exists before sentinel-acquisition. The lock module
  // makes the dir lazily inside writeLock, but the spawn sentinel runs
  // BEFORE writeLock so we need to mkdir here too. Idempotent.
  await mkdir(dirname(sentinelFile), { recursive: true });
  let acquired = false;
  try {
    const handle = await open(sentinelFile, "wx");
    await handle.close();
    acquired = true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      // Another caller is mid-spawn. Wait for THEIR daemon to come up.
      return await waitForLock(projectRoot, SPAWN_TIMEOUT_MS, opts.expectedVersion);
    }
    throw err;
  }

  try {
    const child = (opts.spawnImpl ?? spawnChild)(
      process.execPath,
      [opts.daemonBin ?? defaultDaemonBin(), "--project-root", projectRoot],
      { detached: true, stdio: "ignore" },
    );
    // Detach the parent from the child so the hook can exit while the
    // daemon keeps running. Without unref(), Node holds the event loop
    // open waiting for the child.
    child.unref();
    return await waitForLock(projectRoot, SPAWN_TIMEOUT_MS, opts.expectedVersion);
  } finally {
    if (acquired) await rm(sentinelFile, { force: true });
  }
}

export async function isHealthy(lock: DaemonLock, expectedVersion?: string): Promise<boolean> {
  if (!isPidAlive(lock.pid)) return false;
  if (expectedVersion !== undefined && lock.version !== expectedVersion) return false;
  try {
    const res = await fetch(`http://127.0.0.1:${lock.port}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function waitForLock(
  projectRoot: string,
  timeoutMs: number,
  expectedVersion?: string,
): Promise<DaemonLock> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lock = await readLock(projectRoot);
    if (lock && (await isHealthy(lock, expectedVersion))) return lock;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`iris-daemon spawn timed out after ${timeoutMs}ms`);
}

function defaultDaemonBin(): string {
  // The hook is bundled at dist/hook/cli.js; the daemon at dist/daemon/cli.js.
  // From the consumer's perspective (the hook calling this), `import.meta.url`
  // resolves to the bundle entry it was inlined into. dirname + "../daemon/cli.js"
  // takes us to the right sibling.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolvePath(here, "..", "daemon", "cli.js");
}
