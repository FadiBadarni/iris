import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { isPidAlive, readLock } from "../../src/daemon/lock.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const cliPath = resolve(repoRoot, "dist", "daemon", "cli.js");

type RunResult = { code: number; stdout: string; stderr: string };

function runDaemon(args: string[]): Promise<RunResult> {
  return new Promise((resolveOuter) => {
    const child = spawn("node", [cliPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => {
      stdout += b.toString();
    });
    child.stderr.on("data", (b) => {
      stderr += b.toString();
    });
    child.on("close", (code) => resolveOuter({ code: code ?? 0, stdout, stderr }));
  });
}

async function startDetachedDaemon(projectRoot: string): Promise<number> {
  // Spawn the daemon detached so it survives our test process. We poll
  // the lock file to confirm startup; the test cleans it up via stop.
  // 10s deadline (was 5s) — Ubuntu CI runners spend 1-3s evaluating the
  // bundled daemon entry on cold Node startup, leaving little headroom
  // before vitest's per-test timeout fires.
  const child = spawn("node", [cliPath, "--project-root", projectRoot], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const lock = await readLock(projectRoot);
    if (lock) return lock.pid;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("daemon failed to write lock within 10s");
}

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "iris-lifecycle-test-"));
});

afterEach(async () => {
  // Best-effort: stop a running daemon if the test left one alive.
  await runDaemon(["stop", "--project-root", tmp]);
  await rm(tmp, { recursive: true, force: true });
});

describe("iris-daemon status (e2e)", () => {
  test("reports 'not running' when no lock exists", async () => {
    const r = await runDaemon(["status", "--project-root", tmp]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/not running/);
  });

  test(
    "reports pid + port + uptime when a daemon is running",
    async () => {
      const pid = await startDetachedDaemon(tmp);
      try {
        const r = await runDaemon(["status", "--project-root", tmp]);
        expect(r.code).toBe(0);
        expect(r.stdout).toMatch(/running for/);
        expect(r.stdout).toMatch(new RegExp(`pid=${pid}`));
        expect(r.stdout).toMatch(/port=\d+/);
        expect(r.stdout).toMatch(/uptime=\d+s/);
      } finally {
        await runDaemon(["stop", "--project-root", tmp]);
      }
    },
    20_000,
  );
});

describe("iris-daemon stop (e2e)", () => {
  test("reports 'not running' when no lock exists", async () => {
    const r = await runDaemon(["stop", "--project-root", tmp]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/not running/);
  });

  test("kills the running daemon and clears the lock", async () => {
    const pid = await startDetachedDaemon(tmp);
    expect(isPidAlive(pid)).toBe(true);

    const r = await runDaemon(["stop", "--project-root", tmp]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/SIGTERM sent/);

    // The daemon's signal handler clears the lock and exits. Wait for
    // both within a generous deadline (chokidar close + http close +
    // file remove takes a beat).
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      const lock = await readLock(tmp);
      const dead = !isPidAlive(pid);
      if (!lock && dead) return;
      await new Promise((res) => setTimeout(res, 50));
    }
    throw new Error(`daemon (pid ${pid}) did not exit + clear lock within 3s after stop`);
  }, 20_000);
});
