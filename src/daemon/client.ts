// HTTP client for the iris-daemon. Used by the hook (and any other client
// that wants the same lint pipeline without paying Node startup cost).
//
// Same authentication shape as the daemon expects: `x-iris-token` header
// carrying the 32-byte token from the project-root lock file. AbortSignal
// timeouts cap each call so a stuck daemon never freezes a Claude Code
// tool call.

import type { IrisLintMessage } from "../lint/types.js";
import type { DaemonLock } from "./lock.js";

/**
 * Per-call timeout for `/lint`. The headline budget is <200ms warm; this
 * generous cap exists so a wedged daemon can still be detected and the
 * caller can fall back to in-process lint without blocking. Set above the
 * v3 config evaluator's internal 3s timeout (`src/theme/v3.ts`) so a
 * cold first call parsing a slow but valid `tailwind.config.ts` isn't
 * aborted into a duplicate in-process parse.
 */
const LINT_TIMEOUT_MS = 5_000;

export type LintRequest = {
  source: string;
  filename: string;
  projectRoot?: string;
};

export async function lintViaDaemon(
  lock: DaemonLock,
  request: LintRequest,
): Promise<IrisLintMessage[]> {
  const res = await fetch(`http://127.0.0.1:${lock.port}/lint`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-iris-token": lock.token,
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(LINT_TIMEOUT_MS),
  });
  if (res.status !== 200) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(`iris-daemon /lint returned ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { violations?: unknown };
  if (!Array.isArray(json.violations)) {
    throw new Error(
      "iris-daemon /lint returned 200 with an unexpected body shape (no violations array)",
    );
  }
  return json.violations as IrisLintMessage[];
}
