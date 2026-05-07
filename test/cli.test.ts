import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type LintIO, runLint } from "../src/cli.js";
import { version } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));

function captureIO(): LintIO & { stdout: string; stderr: string } {
  const buf = { stdout: "", stderr: "" };
  return {
    out: (line) => {
      buf.stdout += `${line}\n`;
    },
    err: (line) => {
      buf.stderr += `${line}\n`;
    },
    get stdout() {
      return buf.stdout;
    },
    get stderr() {
      return buf.stderr;
    },
  };
}

describe("iris cli", () => {
  it("exports the package version", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("runLint parses a v3 theme and exits 1 (engine not implemented)", async () => {
    const io = captureIO();
    const code = await runLint([], { cwd: resolve(here, "fixtures", "v3-basic") }, io);
    expect(code).toBe(1);
    expect(io.stdout).toContain("parsed tailwind v3 theme");
    expect(io.stderr).toContain("not implemented");
  });

  it("runLint exits 2 when no tailwind project is detected", async () => {
    const io = captureIO();
    const code = await runLint([], { cwd: here }, io);
    expect(code).toBe(2);
    expect(io.stderr).toContain("no tailwind");
  });

  it("runLint exits 2 when --entry points at a missing file", async () => {
    const io = captureIO();
    const code = await runLint(
      [],
      { cwd: resolve(here, "fixtures", "v4-basic"), entry: "does-not-exist.css" },
      io,
    );
    expect(code).toBe(2);
    expect(io.stderr).toContain("iris:");
  });

  it("runLint accepts custom path globs in args", async () => {
    const io = captureIO();
    const code = await runLint(
      ["app/**/*.tsx"],
      { cwd: resolve(here, "fixtures", "v3-basic") },
      io,
    );
    expect(code).toBe(1);
    expect(io.stderr).toContain("targets: app/**/*.tsx");
  });
});
