// HTTP daemon factory. Mirrors the createIrisMcpServer split: pure factory
// takes injected resolvers, the cli.ts wrapper mounts real ones backed by
// parseTheme / parseShadcn / loadConfig and watches for file changes (β).
//
// Loopback only — bound to 127.0.0.1, never to a public interface. Auth is
// a 32-byte random token written to .iris/daemon.json (mode 0o600). Same
// trust boundary as a project-local .npmrc with credentials: same-machine
// users with read access to the lock file can authenticate; others can't.
//
// Routes are deliberately tiny — POST /lint and GET /health. The hook is
// the only client; broader endpoints can land in a later release if a
// non-MCP client surfaces.

import { timingSafeEqual } from "node:crypto";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import type { IrisConfig } from "../config/types.js";
import { lintSource } from "../lint/linter.js";
import type { ResolveConfig, ResolveShadcn, ResolveTheme } from "../mcp/server.js";
import type { ShadcnState } from "../shadcn/types.js";
import type { ResolvedTheme } from "../theme/types.js";

export type CreateDaemonOpts = {
  resolveTheme: ResolveTheme;
  resolveShadcn?: ResolveShadcn;
  resolveConfig?: ResolveConfig;
  token: string;
  version: string;
  startedAt: Date;
  /**
   * Optional override for `/health.pid` — defaults to `process.pid`. Tests
   * pass a fixed value to assert pid-mismatch detection without spawning
   * an out-of-process daemon.
   */
  pid?: number;
};

export function createIrisDaemon(opts: CreateDaemonOpts): Server {
  const tokenBuf = Buffer.from(opts.token, "utf8");

  return createServer((req, res) => {
    handleRequest(req, res, opts, tokenBuf).catch((err) => {
      writeJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    });
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: CreateDaemonOpts,
  tokenBuf: Buffer,
): Promise<void> {
  const url = req.url ?? "/";

  if (req.method === "GET" && url === "/health") {
    return writeJson(res, 200, {
      status: "ok",
      version: opts.version,
      uptimeMs: Date.now() - opts.startedAt.getTime(),
      // Identity check for status/stop callers: the lock file records the
      // pid that wrote it, and a foreign process listening on the recorded
      // port (or a daemon whose pid was reused after crash) would never
      // have this exact pid. Lets clients prove they're talking to the
      // daemon they expect before SIGTERM'ing or trusting the response.
      pid: opts.pid ?? process.pid,
    });
  }

  if (req.method === "POST" && url === "/lint") {
    if (!authOk(req, tokenBuf)) {
      return writeJson(res, 401, { error: "iris-daemon: invalid or missing x-iris-token" });
    }
    return handleLint(req, res, opts);
  }

  return writeJson(res, 404, { error: `iris-daemon: ${req.method ?? "?"} ${url} not handled` });
}

function authOk(req: IncomingMessage, expected: Buffer): boolean {
  const supplied = req.headers["x-iris-token"];
  if (typeof supplied !== "string") return false;
  const buf = Buffer.from(supplied, "utf8");
  // timingSafeEqual requires equal-length inputs. Different lengths can
  // never match, so reject early without leaking a comparable timing
  // signal to the caller.
  if (buf.length !== expected.length) return false;
  return timingSafeEqual(buf, expected);
}

async function handleLint(
  req: IncomingMessage,
  res: ServerResponse,
  opts: CreateDaemonOpts,
): Promise<void> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (err) {
    if ((err as { code?: string }).code === "ERR_BODY_TOO_LARGE") {
      return writeJson(res, 413, {
        error: `iris-daemon: request body exceeds ${MAX_BODY_BYTES}-byte limit`,
      });
    }
    return writeJson(res, 400, {
      error: `iris-daemon: failed to read request body: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return writeJson(res, 400, { error: "iris-daemon: request body is not valid JSON" });
  }

  const args = body as { source?: unknown; filename?: unknown; projectRoot?: unknown } | undefined;
  if (typeof args?.source !== "string" || typeof args?.filename !== "string") {
    return writeJson(res, 400, {
      error:
        "iris-daemon: /lint requires { source: string, filename: string, projectRoot?: string }",
    });
  }
  const projectRoot = typeof args.projectRoot === "string" ? args.projectRoot : undefined;

  let theme: ResolvedTheme;
  try {
    theme = await opts.resolveTheme(args.filename, projectRoot);
  } catch (err) {
    return writeJson(res, 500, {
      error: `iris-daemon: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // Same best-effort posture as lint_source: shadcn / config errors fall
  // back to the no-shadcn / no-config path rather than failing the lint.
  let shadcn: ShadcnState | undefined;
  if (opts.resolveShadcn) {
    try {
      shadcn = await opts.resolveShadcn(args.filename, projectRoot);
    } catch {
      shadcn = undefined;
    }
  }
  let config: IrisConfig | undefined;
  if (opts.resolveConfig) {
    try {
      config = await opts.resolveConfig(args.filename, projectRoot);
    } catch {
      config = undefined;
    }
  }

  const messages = await lintSource(args.source, args.filename, theme, shadcn, config);
  return writeJson(res, 200, { violations: messages });
}

// 5 MiB body cap. The largest realistic JSX file is ~50 KB; this leaves two
// orders of magnitude of headroom while preventing a same-user attacker (or
// buggy client) from OOM'ing the daemon by streaming an unbounded body.
const MAX_BODY_BYTES = 5 * 1024 * 1024;

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      // Destroying the socket aborts the upload. The fetch client sees this
      // as a connection error; we still write a 413 below via the catcher.
      req.destroy();
      const err = new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`);
      (err as { code?: string }).code = "ERR_BODY_TOO_LARGE";
      throw err;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}
