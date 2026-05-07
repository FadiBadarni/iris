#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { loadConfig } from "../config/load.js";
import type { IrisConfig } from "../config/types.js";
import { lintViaDaemon } from "../daemon/client.js";
import { getOrSpawnDaemon } from "../daemon/spawn.js";
import { parseTheme, version } from "../index.js";
import { parseShadcn } from "../shadcn/detect.js";
import {
  type HookDecision,
  type HookEvent,
  decideFromMessages,
  lintInputFromEvent,
  preWrite,
} from "./preWrite.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) {
    return;
  }
  let event: HookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    // Unknown stdin shape — let Claude Code's tool call through. iris
    // refusing to participate is always preferable to iris blocking valid
    // work because the hook contract drifted.
    return;
  }

  // Skip the heavy lifting (daemon spawn, theme parse) for files we don't
  // analyze. Same JSX_LIKE guard preWrite would apply, hoisted here so the
  // daemon path doesn't get spawned for a package.json edit.
  const input = lintInputFromEvent(event);
  if (!input) {
    return;
  }

  // The daemon's cwd is the directory that owns the Tailwind config for
  // this file. Walk up from the file looking for `tailwind.config.*` so
  // monorepos with a shared root-level config (Turborepo, Nx) work even
  // when the edited file lives in a workspace package whose own
  // `package.json` has no config of its own. If no ancestor has a
  // Tailwind config, this isn't a Tailwind project for our purposes —
  // exit silently and avoid the daemon spawn entirely. v4 CSS-first
  // projects without a JS config can drop a stub `export default {}` to
  // opt in; documented limitation.
  let cwd = process.cwd();
  if (event?.tool_input?.file_path) {
    const root = findTailwindRoot(event.tool_input.file_path);
    if (!root) return;
    cwd = root;
  } else if (!hasTailwindConfig(cwd)) {
    return;
  }

  let decision: HookDecision = null;

  // Opt-out: IRIS_NO_DAEMON=1 forces the in-process path silently.
  // Useful for debugging the daemon, sandboxed environments without
  // process-spawn permission, or producing a clean baseline for an
  // issue report. Empty string, "0", and the case-insensitive
  // "false"/"no"/"off" strings all mean "use the daemon" — anything
  // else opts out. Mirrors common Unix env-var conventions so
  // IRIS_NO_DAEMON=false doesn't unexpectedly opt out.
  const noDaemon = isTruthyEnv(process.env.IRIS_NO_DAEMON);

  let daemonErr: unknown;
  if (!noDaemon) {
    // Daemon path: detect-or-spawn an iris-daemon for this project root
    // and POST the lint request. Headline win: daemon holds warm
    // theme/shadcn/config caches, so the warm-call latency drops below
    // the <200ms budget CLAUDE.md set for the hook (cold startup pays
    // the spawn cost once).
    try {
      const lock = await getOrSpawnDaemon(cwd, { expectedVersion: version });
      const messages = await lintViaDaemon(lock, {
        source: input.source,
        filename: input.filename,
        projectRoot: cwd,
      });
      decision = decideFromMessages(input.filename, messages);
    } catch (err) {
      daemonErr = err;
    }
  }

  if (noDaemon || daemonErr) {
    // Fallback path: in-process resolution. Slower but guarantees the
    // hook never blocks Claude Code on a daemon hiccup. Surface the
    // daemon error to stderr (visible in `claude --debug`) for triage —
    // but only when we tried the daemon and it failed; opt-out is
    // intentional and stays silent.
    if (daemonErr) {
      process.stderr.write(
        `iris-hook: daemon path failed, falling back to in-process: ${
          daemonErr instanceof Error ? daemonErr.message : String(daemonErr)
        }\n`,
      );
    }
    try {
      const theme = await parseTheme({ cwd });
      const shadcn = await parseShadcn({ cwd });
      let config: IrisConfig | undefined;
      try {
        config = (await loadConfig({ cwd })) ?? undefined;
      } catch (err) {
        process.stderr.write(
          `iris-hook: failed to load iris.config — falling back to defaults: ${
            err instanceof Error ? err.message : String(err)
          }\n`,
        );
      }
      decision = await preWrite(event, theme, shadcn, config);
    } catch {
      // Not a tailwind project, or another fatal — silent skip, same as
      // the legacy hook behavior so a non-iris repo never breaks Claude
      // Code's flow. Return rather than process.exit(0) for the same
      // libuv-on-Windows reason as the top-level catch.
      return;
    }
  }

  if (decision !== null) {
    process.stdout.write(JSON.stringify(decision));
  }
}

function isTruthyEnv(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  if (v === "" || v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}

const TAILWIND_CONFIG_NAMES = [
  "tailwind.config.ts",
  "tailwind.config.js",
  "tailwind.config.mjs",
  "tailwind.config.cjs",
] as const;

function hasTailwindConfig(dir: string): boolean {
  for (const name of TAILWIND_CONFIG_NAMES) {
    if (existsSync(resolvePath(dir, name))) return true;
  }
  return false;
}

function findTailwindRoot(filePath: string): string | null {
  // Walk up from the file's directory, returning the first ancestor with
  // a `tailwind.config.*`. Covers Turborepo / Nx monorepos where the
  // shared config sits at the workspace root rather than inside the
  // package containing the edited file. Bounded to 30 hops to defeat
  // symlink loops.
  let dir = dirname(resolvePath(filePath));
  for (let i = 0; i < 30; i++) {
    if (hasTailwindConfig(dir)) return dir;
    const parent = resolvePath(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

main().catch((err) => {
  // Never block a Claude Code tool call on iris errors. Surface to stderr
  // so a misconfigured iris install is debuggable. Don't call
  // process.exit() — that races with libuv's closure of the detached
  // daemon child handle on Windows. Letting Node exit naturally avoids
  // the `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` panic.
  process.stderr.write(`iris-hook: ${err instanceof Error ? err.message : String(err)}\n`);
});
