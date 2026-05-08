import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { lintViaDaemon } from "../../src/daemon/client.js";
import type { DaemonLock } from "../../src/daemon/lock.js";
import { createIrisDaemon } from "../../src/daemon/server.js";
import type { ResolvedTheme, TokenEntry } from "../../src/theme/types.js";

const TOKEN = "0".repeat(64);

function fakeTheme(entries: Array<Pick<TokenEntry, "name" | "value" | "type">>): ResolvedTheme {
  const tokens = new Map<string, TokenEntry>();
  const byValue = new Map<string, TokenEntry[]>();
  for (const partial of entries) {
    const e: TokenEntry = { source: "v4-theme", file: "test.css", ...partial };
    tokens.set(e.name, e);
    const list = byValue.get(e.value) ?? [];
    list.push(e);
    byValue.set(e.value, list);
  }
  return {
    version: 4,
    tokens,
    byValue,
    sources: ["test.css"],
    warnings: [],
    suppressedPrefixes: new Set(),
  };
}

let server: Server;
let lock: DaemonLock;

beforeEach(async () => {
  server = createIrisDaemon({
    resolveTheme: async () =>
      fakeTheme([{ name: "colors.brand.salmon", value: "#fa8072", type: "color" }]),
    token: TOKEN,
    version: "0.5.0-test",
    startedAt: new Date(),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("daemon failed to bind");
  lock = {
    pid: process.pid,
    port: addr.port,
    token: TOKEN,
    version: "0.5.0-test",
    startedAt: new Date().toISOString(),
  };
});

afterEach(async () => {
  // Force-drop keep-alive sockets so close() doesn't wait the full
  // keepAliveTimeout (5s) for fetch's pooled sockets to idle. Without
  // this, every test takes ~5s on Ubuntu CI and trips vitest's 5s
  // default timeout — see comment in server.test.ts withDaemon.
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
  });
});

describe("lintViaDaemon", () => {
  test("returns violations from the daemon for an off-token class", async () => {
    const messages = await lintViaDaemon(lock, {
      source: '<div className="bg-[#fa8072]" />',
      filename: "Hero.tsx",
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.classname).toBe("bg-[#fa8072]");
    expect(messages[0]?.suggestion?.kind).toBe("exact");
  });

  test("throws on a wrong token (401)", async () => {
    const wrongLock = { ...lock, token: "f".repeat(64) };
    await expect(lintViaDaemon(wrongLock, { source: "x", filename: "x.tsx" })).rejects.toThrow(
      /401/,
    );
  });

  test("throws when the daemon is unreachable (port closed)", async () => {
    // Find a port that's almost certainly not listening — bind+release a
    // socket then reuse the freed port number for the lock.
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await expect(lintViaDaemon(lock, { source: "x", filename: "x.tsx" })).rejects.toThrow();
  });
});
