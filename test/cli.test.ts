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

  it("runLint exits 0 against a project with no violations", async () => {
    const io = captureIO();
    // v3-basic has only tailwind.config.ts; the glob picks it up but the
    // plugin's rules don't fire on a config file (no JSX), so no violations.
    const code = await runLint([], { cwd: resolve(here, "fixtures", "v3-basic") }, io);
    expect(code).toBe(0);
    expect(io.stdout).toBe("");
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

  it("runLint exits 1 when a fixture has violations and emits human output", async () => {
    const io = captureIO();
    const code = await runLint(["**/*.tsx"], { cwd: resolve(here, "fixtures", "lint-cli") }, io);
    expect(code).toBe(1);
    expect(io.stdout).toContain("Hero.tsx");
    // The violation surfaces with the iris-styled suggestion line.
    expect(io.stdout).toMatch(/bg-\[#fa8072\].+bg-brand-salmon/);
    // The allowlisted bg-[url(...)] does NOT show up.
    expect(io.stdout).not.toContain("bg-[url");
  });

  it("runLint emits valid envelope JSON with --format=json", async () => {
    const io = captureIO();
    const code = await runLint(
      ["**/*.tsx"],
      { cwd: resolve(here, "fixtures", "lint-cli"), format: "json" },
      io,
    );
    expect(code).toBe(1);
    const parsed = JSON.parse(io.stdout);
    expect(parsed.tool).toBe("iris");
    expect(parsed.summary.errorCount).toBe(1);
    expect(parsed.files[0].violations[0].classname).toBe("bg-[#fa8072]");
    expect(parsed.files[0].violations[0].suggestion.replacement).toBe("bg-brand-salmon");
  });

  it("runLint emits valid SARIF v2.1.0 with --format=sarif", async () => {
    const io = captureIO();
    const code = await runLint(
      ["**/*.tsx"],
      { cwd: resolve(here, "fixtures", "lint-cli"), format: "sarif" },
      io,
    );
    expect(code).toBe(1);
    const parsed = JSON.parse(io.stdout);
    expect(parsed.version).toBe("2.1.0");
    expect(parsed.runs[0].tool.driver.name).toBe("iris");
    expect(parsed.runs[0].results[0].ruleId).toBe("tailwindcss/no-arbitrary-value");
  });
});
