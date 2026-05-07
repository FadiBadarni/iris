// Lock file at <projectRoot>/.iris/daemon.json — the IPC handshake between
// the iris-hook client and the iris-daemon process. The hook reads this to
// find the daemon's port + auth token; the daemon writes it on startup and
// clears it on shutdown. Stale locks (PID gone, port unreachable) are
// detected by the spawn module via `isPidAlive` + a TCP connect attempt.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";

export type DaemonLock = {
  /** OS process id of the running daemon. */
  pid: number;
  /** Loopback HTTP port the daemon is listening on. */
  port: number;
  /** 64-char hex token (32 random bytes) the hook sends in headers. */
  token: string;
  /** iris-cc version that started the daemon — mismatches trigger respawn. */
  version: string;
  /** ISO timestamp of daemon startup. */
  startedAt: string;
};

const LOCK_DIR = ".iris";
const LOCK_FILE = "daemon.json";

export function lockPath(projectRoot: string): string {
  return resolvePath(projectRoot, LOCK_DIR, LOCK_FILE);
}

export async function readLock(projectRoot: string): Promise<DaemonLock | null> {
  let raw: string;
  try {
    raw = await readFile(lockPath(projectRoot), "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return validateLock(parsed);
}

export async function writeLock(projectRoot: string, lock: DaemonLock): Promise<void> {
  const target = lockPath(projectRoot);
  await mkdir(dirname(target), { recursive: true });
  // Atomic-ish write: write to a sibling temp file then rename. The temp
  // filename includes a UUID so two concurrent calls (same process) don't
  // collide on the temp path; on disk, two daemon *processes* write
  // distinct files and the rename is the conflict point — last writer wins.
  // Mode 0o600: only the daemon owner can read the token. Same posture as
  // a project-local .npmrc with credentials.
  const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(lock, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(tmp, target);
}

export async function clearLock(projectRoot: string, expected?: DaemonLock): Promise<void> {
  // Ownership-checked clear: a daemon shutting down should NOT delete a
  // replacement lock that a fresh daemon already wrote. Compare on
  // (pid, token, startedAt) — a unique-enough triple to prove the lock
  // we read is the one we wrote. If `expected` is omitted, behave as
  // before (unconditional remove) — used by the spawn module to clear
  // a stale lock whose PID is gone.
  if (expected) {
    const current = await readLock(projectRoot);
    if (current === null) return;
    if (
      current.pid !== expected.pid ||
      current.token !== expected.token ||
      current.startedAt !== expected.startedAt
    ) {
      return;
    }
  }
  await rm(lockPath(projectRoot), { force: true });
}

export function isPidAlive(pid: number): boolean {
  // Signal 0 is the POSIX "is the process alive" probe — it doesn't actually
  // send a signal, just performs the same permission + existence checks the
  // kernel does for a real signal. Throws ESRCH if dead, EPERM if we can't
  // signal it (which means it IS alive, just owned by another user).
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    return false;
  }
}

// 64-char hex token = 32 random bytes encoded as hex. The auth path expects
// this exact shape; validating it here keeps a corrupted lock from leaking
// a too-short token into the constant-time compare.
const TOKEN_RE = /^[0-9a-f]{64}$/i;

function validateLock(raw: unknown): DaemonLock | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    !Number.isSafeInteger(r.pid) ||
    (r.pid as number) <= 0 ||
    !Number.isSafeInteger(r.port) ||
    (r.port as number) < 1 ||
    (r.port as number) > 65535 ||
    typeof r.token !== "string" ||
    !TOKEN_RE.test(r.token) ||
    typeof r.version !== "string" ||
    typeof r.startedAt !== "string"
  ) {
    return null;
  }
  return {
    pid: r.pid as number,
    port: r.port as number,
    token: r.token,
    version: r.version,
    startedAt: r.startedAt,
  };
}
