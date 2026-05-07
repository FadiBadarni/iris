import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type DaemonLock, lockPath, readLock, writeLock } from "../../src/daemon/lock.js";
import { createIrisDaemon } from "../../src/daemon/server.js";
import { getOrSpawnDaemon, isHealthy } from "../../src/daemon/spawn.js";
import type { ResolvedTheme } from "../../src/theme/types.js";

const TOKEN = "0".repeat(64);

function emptyTheme(): ResolvedTheme {
  return {
    version: 4,
    tokens: new Map(),
    byValue: new Map(),
    sources: [],
    warnings: [],
    suppressedPrefixes: new Set(),
  };
}

let tmp: string;
let server: Server | null;
let serverLock: DaemonLock | null;

async function startInProcessDaemon(version = "0.5.0-test"): Promise<DaemonLock> {
  const s = createIrisDaemon({
    resolveTheme: async () => emptyTheme(),
    token: TOKEN,
    version,
    startedAt: new Date(),
  });
  server = s;
  await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
  const addr = s.address();
  if (addr === null || typeof addr === "string") throw new Error("daemon failed to bind");
  return {
    pid: process.pid,
    port: addr.port,
    token: TOKEN,
    version,
    startedAt: new Date().toISOString(),
  };
}

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "iris-spawn-test-"));
  server = null;
  serverLock = null;
});

afterEach(async () => {
  const s = server;
  if (s) await new Promise<void>((resolve) => s.close(() => resolve()));
  await rm(tmp, { recursive: true, force: true });
});

describe("getOrSpawnDaemon — happy path against a live daemon", () => {
  test("returns the existing lock when the daemon is healthy", async () => {
    serverLock = await startInProcessDaemon();
    await writeLock(tmp, serverLock);

    const got = await getOrSpawnDaemon(tmp, {
      expectedVersion: "0.5.0-test",
      // spawn should NOT be called — the existing daemon is healthy
      spawnImpl: () => {
        throw new Error("spawn should not be called when lock is healthy");
      },
    });

    expect(got.port).toBe(serverLock.port);
  });

  test("clears stale lock (PID gone) and uses injected spawn to write a fresh one", async () => {
    // Lock points at a PID that doesn't exist
    const stale: DaemonLock = {
      pid: 0xfffffffe,
      port: 65535,
      token: TOKEN,
      version: "0.5.0-test",
      startedAt: new Date().toISOString(),
    };
    await writeLock(tmp, stale);

    serverLock = await startInProcessDaemon();
    const fresh = serverLock;

    let spawnCalled = false;
    const got = await getOrSpawnDaemon(tmp, {
      expectedVersion: "0.5.0-test",
      spawnImpl: () => {
        spawnCalled = true;
        // Fake spawn: instead of forking node, write the lock file from
        // OUR in-process daemon and return a no-op child shape.
        void writeLock(tmp, fresh);
        return {
          unref() {},
        } as unknown as ReturnType<typeof import("node:child_process").spawn>;
      },
    });

    expect(spawnCalled).toBe(true);
    expect(got.port).toBe(fresh.port);
    // Stale lock was replaced
    const onDisk = await readLock(tmp);
    expect(onDisk?.pid).toBe(fresh.pid);
  });

  test("respawns when version mismatches", async () => {
    serverLock = await startInProcessDaemon("0.4.0-old");
    await writeLock(tmp, serverLock);
    const oldServer = server;
    server = null;

    // New daemon at the new version
    const fresh = await startInProcessDaemon("0.5.0-new");

    let spawnCalled = false;
    const got = await getOrSpawnDaemon(tmp, {
      expectedVersion: "0.5.0-new",
      spawnImpl: () => {
        spawnCalled = true;
        void writeLock(tmp, fresh);
        return { unref() {} } as unknown as ReturnType<typeof import("node:child_process").spawn>;
      },
    });

    expect(spawnCalled).toBe(true);
    expect(got.version).toBe("0.5.0-new");
    expect(got.port).toBe(fresh.port);

    if (oldServer) await new Promise<void>((resolve) => oldServer.close(() => resolve()));
  });

  test("throws when the daemon never writes a lock within the timeout", async () => {
    // No lock ever appears, no real spawn happens
    await expect(
      getOrSpawnDaemon(tmp, {
        expectedVersion: "0.5.0-test",
        spawnImpl: () =>
          ({ unref() {} }) as unknown as ReturnType<typeof import("node:child_process").spawn>,
      }),
    ).rejects.toThrow(/timed out/);
  }, 10_000);
});

describe("isHealthy", () => {
  test("returns false when PID is gone", async () => {
    expect(
      await isHealthy({
        pid: 0xfffffffe,
        port: 65535,
        token: TOKEN,
        version: "0.5.0",
        startedAt: new Date().toISOString(),
      }),
    ).toBe(false);
  });

  test("returns false on version mismatch", async () => {
    serverLock = await startInProcessDaemon("0.4.0-old");
    expect(await isHealthy(serverLock, "0.5.0-new")).toBe(false);
  });

  test("returns true for a live, version-matched daemon", async () => {
    serverLock = await startInProcessDaemon("0.5.0-test");
    expect(await isHealthy(serverLock, "0.5.0-test")).toBe(true);
  });
});

describe("lock side-effects in the project root", () => {
  test("getOrSpawnDaemon does not stomp on an unrelated lock dir", async () => {
    // Sanity — getOrSpawnDaemon should only touch <root>/.iris, not
    // siblings like <root>/.git or <root>/node_modules.
    const sibling = lockPath(tmp);
    expect(sibling).toMatch(/[\\/]\.iris[\\/]daemon\.json$/);
  });
});
