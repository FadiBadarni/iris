import { describe, expect, test } from "vitest";
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

// Spin the daemon HTTP server up on an OS-assigned port, run `fn`, and
// always tear down. Mirrors the InMemoryTransport pattern the MCP tests use.
async function withDaemon<T>(
  opts: Parameters<typeof createIrisDaemon>[0],
  fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createIrisDaemon(opts);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("daemon did not bind a port");
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    return await fn(baseUrl);
  } finally {
    // Force-drop keep-alive sockets BEFORE awaiting close(). Without
    // closeAllConnections, server.close() waits up to keepAliveTimeout
    // (5s default) for fetch's pooled sockets to idle out — which on
    // Ubuntu CI runners hit our 5s vitest timeout exactly. Locally on
    // Windows, undici closes sockets faster and we never noticed.
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    });
  }
}

describe("createIrisDaemon — POST /lint", () => {
  const baseOpts = {
    resolveTheme: async () => fakeTheme([]),
    token: TOKEN,
    version: "0.5.0-test",
    startedAt: new Date("2026-05-07T12:00:00Z"),
  };

  test("returns 200 + violations for an off-token class", async () => {
    const opts = {
      ...baseOpts,
      resolveTheme: async () =>
        fakeTheme([{ name: "colors.brand.salmon", value: "#fa8072", type: "color" }]),
    };
    await withDaemon(opts, async (base) => {
      const res = await fetch(`${base}/lint`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-iris-token": TOKEN },
        body: JSON.stringify({
          source: '<div className="bg-[#fa8072]" />',
          filename: "Hero.tsx",
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { violations: Array<{ classname?: string }> };
      expect(body.violations).toHaveLength(1);
      expect(body.violations[0]?.classname).toBe("bg-[#fa8072]");
    });
  });

  test("returns 401 without a token", async () => {
    await withDaemon(baseOpts, async (base) => {
      const res = await fetch(`${base}/lint`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "x", filename: "x.tsx" }),
      });
      expect(res.status).toBe(401);
    });
  });

  test("returns 401 with the wrong token", async () => {
    await withDaemon(baseOpts, async (base) => {
      const res = await fetch(`${base}/lint`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-iris-token": "1".repeat(64) },
        body: JSON.stringify({ source: "x", filename: "x.tsx" }),
      });
      expect(res.status).toBe(401);
    });
  });

  test("returns 400 on a malformed body", async () => {
    await withDaemon(baseOpts, async (base) => {
      const res = await fetch(`${base}/lint`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-iris-token": TOKEN },
        body: "{ this is not valid json",
      });
      expect(res.status).toBe(400);
    });
  });

  test("returns 400 when required fields are missing", async () => {
    await withDaemon(baseOpts, async (base) => {
      const res = await fetch(`${base}/lint`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-iris-token": TOKEN },
        body: JSON.stringify({ source: "x" }), // missing filename
      });
      expect(res.status).toBe(400);
    });
  });

  test("returns 500 with error message when resolveTheme throws", async () => {
    const opts = {
      ...baseOpts,
      resolveTheme: async () => {
        throw new Error("no tailwind project at this root");
      },
    };
    await withDaemon(opts, async (base) => {
      const res = await fetch(`${base}/lint`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-iris-token": TOKEN },
        body: JSON.stringify({ source: "x", filename: "x.tsx" }),
      });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("no tailwind project");
    });
  });
});

describe("createIrisDaemon — POST /lint hardening", () => {
  const baseOpts = {
    resolveTheme: async () => fakeTheme([]),
    token: TOKEN,
    version: "0.5.0-test",
    startedAt: new Date("2026-05-07T12:00:00Z"),
  };

  test("rejects non-string source as 400", async () => {
    // typeof guards on source/filename catch this; lock the contract so
    // a future refactor that loosens validation surfaces in tests.
    await withDaemon(baseOpts, async (base) => {
      const res = await fetch(`${base}/lint`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-iris-token": TOKEN },
        body: JSON.stringify({ source: 123, filename: "x.tsx" }),
      });
      expect(res.status).toBe(400);
    });
  });

  test("handles two parallel requests on the same daemon", async () => {
    const opts = {
      ...baseOpts,
      resolveTheme: async () =>
        fakeTheme([{ name: "colors.brand.salmon", value: "#fa8072", type: "color" }]),
    };
    await withDaemon(opts, async (base) => {
      const make = () =>
        fetch(`${base}/lint`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-iris-token": TOKEN },
          body: JSON.stringify({
            source: '<div className="bg-[#fa8072]" />',
            filename: "Hero.tsx",
          }),
        });
      const [a, b] = await Promise.all([make(), make()]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      const aBody = (await a.json()) as { violations: unknown[] };
      const bBody = (await b.json()) as { violations: unknown[] };
      expect(aBody.violations).toHaveLength(1);
      expect(bBody.violations).toHaveLength(1);
    });
  });

  test("rejects oversize body with 413", async () => {
    // 6 MiB body — over the 5 MiB cap. The server should destroy the
    // socket on overflow; fetch sees that as a network error or a 413.
    const huge = `{"source":"${"a".repeat(6 * 1024 * 1024)}","filename":"x.tsx"}`;
    await withDaemon(baseOpts, async (base) => {
      let status: number | "network-error" = "network-error";
      try {
        const res = await fetch(`${base}/lint`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-iris-token": TOKEN },
          body: huge,
        });
        status = res.status;
      } catch {
        // socket destroyed mid-upload — also acceptable
      }
      expect(status === 413 || status === "network-error").toBe(true);
    });
  });
});

describe("createIrisDaemon — GET /health", () => {
  test("returns 200 with status + uptime + version, no token required", async () => {
    const opts = {
      resolveTheme: async () => fakeTheme([]),
      token: TOKEN,
      version: "0.5.0-test",
      startedAt: new Date(Date.now() - 5000),
    };
    await withDaemon(opts, async (base) => {
      const res = await fetch(`${base}/health`); // no header
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        version: string;
        uptimeMs: number;
      };
      expect(body.status).toBe("ok");
      expect(body.version).toBe("0.5.0-test");
      expect(body.uptimeMs).toBeGreaterThanOrEqual(5000);
    });
  });
});

describe("createIrisDaemon — unknown routes", () => {
  test("returns 404 on unknown paths", async () => {
    const opts = {
      resolveTheme: async () => fakeTheme([]),
      token: TOKEN,
      version: "0.5.0-test",
      startedAt: new Date(),
    };
    await withDaemon(opts, async (base) => {
      const res = await fetch(`${base}/nope`, {
        headers: { "x-iris-token": TOKEN },
      });
      expect(res.status).toBe(404);
    });
  });
});
