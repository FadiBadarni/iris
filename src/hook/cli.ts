#!/usr/bin/env node
import { createRequire } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { parseTheme } from "../index.js";
import { type HookEvent, preWrite } from "./preWrite.js";

const require = createRequire(import.meta.url);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) {
    process.exit(0);
    return;
  }
  let event: HookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    // Unknown stdin shape — let Claude Code's tool call through. iris
    // refusing to participate is always preferable to iris blocking valid
    // work because the hook contract drifted.
    process.exit(0);
    return;
  }

  let cwd = process.cwd();
  if (event?.tool_input?.file_path) {
    cwd = findProjectRoot(event.tool_input.file_path) ?? cwd;
  }

  let theme: Awaited<ReturnType<typeof parseTheme>>;
  try {
    theme = await parseTheme({ cwd });
  } catch {
    // Not a tailwind project, or the parser tripped on something unusual.
    // Silent skip — same posture as malformed stdin.
    process.exit(0);
    return;
  }

  const decision = await preWrite(event, theme);
  if (decision !== null) {
    process.stdout.write(JSON.stringify(decision));
  }
  process.exit(0);
}

function findProjectRoot(filePath: string): string | null {
  // Walk up from the file's directory looking for package.json. Bounded to
  // 30 levels to defeat symlink loops; falls back to process.cwd() in
  // main(). Walking from `dirname` (not the path itself) avoids a wasted
  // first iteration that stats `<file>/package.json`.
  const fs = require("node:fs") as typeof import("node:fs");
  let dir = dirname(resolvePath(filePath));
  for (let i = 0; i < 30; i++) {
    try {
      fs.statSync(resolvePath(dir, "package.json"));
      return dir;
    } catch {
      const parent = resolvePath(dir, "..");
      if (parent === dir) return null;
      dir = parent;
    }
  }
  return null;
}

main().catch((err) => {
  // Never block a Claude Code tool call on iris errors. Surface to stderr
  // so a misconfigured iris install is debuggable, then exit 0 to allow
  // the write through.
  process.stderr.write(`iris-hook: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(0);
});
