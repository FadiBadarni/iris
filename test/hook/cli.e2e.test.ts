import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const fixture = resolve(here, "..", "fixtures", "lint-cli");
const cliPath = resolve(repoRoot, "dist", "hook", "cli.js");

function runHook(stdinJson: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveOuter) => {
    const child = spawn("node", [cliPath], {
      cwd: fixture,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => {
      stdout += b.toString();
    });
    child.stderr.on("data", (b) => {
      stderr += b.toString();
    });
    child.on("close", (code) => resolveOuter({ code: code ?? 0, stdout, stderr }));
    child.stdin.write(stdinJson);
    child.stdin.end();
  });
}

describe("iris-hook CLI (e2e)", () => {
  test("blocks an off-token Write", async () => {
    const event = {
      tool_name: "Write",
      tool_input: {
        file_path: resolve(fixture, "Hero.tsx"),
        content: '<div className="bg-[#fa8072]" />',
      },
    };
    const r = await runHook(JSON.stringify(event));
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.decision).toBe("block");
    expect(parsed.reason).toContain("bg-brand-salmon");
  });

  test("emits empty stdout for a clean Write", async () => {
    const event = {
      tool_name: "Write",
      tool_input: {
        file_path: resolve(fixture, "Hero.tsx"),
        content: '<div className="bg-blue-500" />',
      },
    };
    const r = await runHook(JSON.stringify(event));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("exits 0 with empty stdout when not in a tailwind project", async () => {
    // here is test/hook — no package.json/tailwind.config there.
    const event = {
      tool_name: "Write",
      tool_input: {
        file_path: resolve(here, "irrelevant.tsx"),
        content: '<div className="bg-[#fa8072]" />',
      },
    };
    const r = await runHook(JSON.stringify(event));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("exits 0 silently on malformed stdin", async () => {
    const r = await runHook("not json");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });
});
