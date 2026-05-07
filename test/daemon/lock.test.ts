import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  type DaemonLock,
  clearLock,
  isPidAlive,
  lockPath,
  readLock,
  writeLock,
} from "../../src/daemon/lock.js";

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "iris-lock-test-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const fixture = (overrides: Partial<DaemonLock> = {}): DaemonLock => ({
  pid: 12345,
  port: 51234,
  token: "0".repeat(64),
  version: "0.5.0",
  startedAt: "2026-05-07T12:00:00.000Z",
  ...overrides,
});

describe("lockPath", () => {
  test("resolves to <projectRoot>/.iris/daemon.json", () => {
    expect(lockPath("/proj")).toBe(resolvePath("/proj", ".iris", "daemon.json"));
  });
});

describe("writeLock + readLock", () => {
  test("round-trips a lock", async () => {
    const lock = fixture();
    await writeLock(tmp, lock);
    const read = await readLock(tmp);
    expect(read).toEqual(lock);
  });

  test("creates the .iris directory if missing", async () => {
    await writeLock(tmp, fixture());
    const raw = await readFile(join(tmp, ".iris", "daemon.json"), "utf8");
    expect(JSON.parse(raw).pid).toBe(12345);
  });

  test("readLock returns null when the file is absent", async () => {
    expect(await readLock(tmp)).toBeNull();
  });

  test("readLock returns null when the file is malformed JSON", async () => {
    // Write malformed content directly via writeLock to bypass our writer's
    // contract — simulate a corrupted lock from a prior crashed daemon.
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(join(tmp, ".iris"), { recursive: true });
    await writeFile(join(tmp, ".iris", "daemon.json"), "{broken json", "utf8");
    expect(await readLock(tmp)).toBeNull();
  });

  test("readLock returns null when required fields are missing", async () => {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(join(tmp, ".iris"), { recursive: true });
    await writeFile(join(tmp, ".iris", "daemon.json"), JSON.stringify({ pid: 1 }), "utf8");
    expect(await readLock(tmp)).toBeNull();
  });
});

describe("clearLock", () => {
  test("deletes an existing lock", async () => {
    await writeLock(tmp, fixture());
    await clearLock(tmp);
    expect(await readLock(tmp)).toBeNull();
  });

  test("no-ops on missing lock", async () => {
    await expect(clearLock(tmp)).resolves.toBeUndefined();
  });
});

describe("validateLock — guards against corrupted locks", () => {
  test("rejects pid: 0 (POSIX process-group sentinel)", async () => {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(join(tmp, ".iris"), { recursive: true });
    await writeFile(
      join(tmp, ".iris", "daemon.json"),
      JSON.stringify({ ...fixture(), pid: 0 }),
      "utf8",
    );
    expect(await readLock(tmp)).toBeNull();
  });

  test("rejects negative or out-of-range port", async () => {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(join(tmp, ".iris"), { recursive: true });
    await writeFile(
      join(tmp, ".iris", "daemon.json"),
      JSON.stringify({ ...fixture(), port: -1 }),
      "utf8",
    );
    expect(await readLock(tmp)).toBeNull();
    await writeFile(
      join(tmp, ".iris", "daemon.json"),
      JSON.stringify({ ...fixture(), port: 70000 }),
      "utf8",
    );
    expect(await readLock(tmp)).toBeNull();
  });

  test("rejects malformed token (not 64 hex chars)", async () => {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(join(tmp, ".iris"), { recursive: true });
    await writeFile(
      join(tmp, ".iris", "daemon.json"),
      JSON.stringify({ ...fixture(), token: "short" }),
      "utf8",
    );
    expect(await readLock(tmp)).toBeNull();
  });
});

describe("clearLock — ownership-checked variant", () => {
  test("removes the lock when the expected fingerprint matches", async () => {
    const lock = fixture();
    await writeLock(tmp, lock);
    await clearLock(tmp, lock);
    expect(await readLock(tmp)).toBeNull();
  });

  test("preserves the lock when the expected fingerprint mismatches", async () => {
    // Daemon A wants to clear its old lock, but daemon B has already
    // replaced it. clearLock must NOT delete daemon B's live lock.
    const a = fixture({ pid: 111 });
    const b = fixture({ pid: 222, token: "f".repeat(64) });
    await writeLock(tmp, b);
    await clearLock(tmp, a); // a tries to clear; b's lock is current
    const current = await readLock(tmp);
    expect(current?.pid).toBe(222);
  });

  test("no-ops when no lock exists, even with expected", async () => {
    await expect(clearLock(tmp, fixture())).resolves.toBeUndefined();
  });
});

describe("isPidAlive", () => {
  test("returns true for the current process", () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  test("returns false for a guaranteed-dead PID", () => {
    // PID 1 is init/launchd/wininit and always alive on the platforms we
    // care about; instead, pick a PID we know cannot exist. 0xFFFFFFFE is
    // outside any reasonable PID space on Windows / Linux / macOS.
    expect(isPidAlive(0xfffffffe)).toBe(false);
  });
});
