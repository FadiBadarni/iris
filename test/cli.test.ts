import { execSync } from "node:child_process";
import { copyFile, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type LintIO, runLint } from "../src/cli.js";
import { version } from "../src/index.js";

// Initialize a tmp dir as a git repo with one initial commit. Used by the
// --fix safety tests to set up a known-clean baseline that subsequent
// writes can dirty.
function gitInitAndCommit(dir: string): void {
  execSync("git init", { cwd: dir });
  execSync('git config user.email "t@t.test"', { cwd: dir });
  execSync("git config user.name t", { cwd: dir });
  execSync("git add .", { cwd: dir });
  execSync('git commit -m "init"', { cwd: dir });
}

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

  it("runLint --fix rewrites the source in place and exits 0", async () => {
    // Copy the lint-cli fixture into a tmp dir so the real fixture isn't
    // mutated between test runs.
    const fixtureSrc = resolve(here, "fixtures", "lint-cli");
    const sandbox = await mkdtemp(join(tmpdir(), "iris-fix-"));
    try {
      await copyFile(join(fixtureSrc, "package.json"), join(sandbox, "package.json"));
      await copyFile(join(fixtureSrc, "tailwind.config.ts"), join(sandbox, "tailwind.config.ts"));
      await copyFile(join(fixtureSrc, "Hero.tsx"), join(sandbox, "Hero.tsx"));

      const io = captureIO();
      const code = await runLint(["**/*.tsx"], { cwd: sandbox, fix: true }, io);

      expect(code).toBe(0);
      const after = await readFile(join(sandbox, "Hero.tsx"), "utf8");
      // The className attribute itself must no longer carry the arbitrary
      // value — file comments may still mention it as documentation, so we
      // anchor the assertion to the className= attribute.
      const classAttr = after.match(/className="([^"]+)"/);
      expect(classAttr?.[1]).not.toContain("bg-[#fa8072]");
      expect(classAttr?.[1]).toContain("bg-brand-salmon");
      // Allowlisted class is untouched.
      expect(classAttr?.[1]).toContain("bg-[url(/hero.jpg)]");
      // CLI surfaces a one-line summary on stderr.
      expect(io.stderr).toMatch(/rewrote 1 class.+1 file/);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it("runLint --fix refuses on a dirty git tree without --force", async () => {
    const fixtureSrc = resolve(here, "fixtures", "lint-cli");
    const sandbox = await mkdtemp(join(tmpdir(), "iris-fix-dirty-"));
    try {
      await cp(fixtureSrc, sandbox, { recursive: true });
      gitInitAndCommit(sandbox);
      // Make the tree dirty by mutating the file the linter would target.
      await writeFile(
        join(sandbox, "Hero.tsx"),
        '// dirty\nexport const Hero = () => <div className="bg-[#fa8072]" />;\n',
      );

      const io = captureIO();
      const code = await runLint(["**/*.tsx"], { cwd: sandbox, fix: true }, io);

      expect(code).toBe(2);
      expect(io.stderr).toContain("--force");
      expect(io.stderr).toMatch(/uncommitted/i);
      // File must not have been rewritten — original arbitrary value still
      // sits in the className.
      const after = await readFile(join(sandbox, "Hero.tsx"), "utf8");
      expect(after).toContain("bg-[#fa8072]");
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it("runLint --fix --force overrides the dirty refusal", async () => {
    const fixtureSrc = resolve(here, "fixtures", "lint-cli");
    const sandbox = await mkdtemp(join(tmpdir(), "iris-fix-force-"));
    try {
      await cp(fixtureSrc, sandbox, { recursive: true });
      gitInitAndCommit(sandbox);
      // Add an unrelated dirty file so the working tree is non-empty.
      await writeFile(join(sandbox, "extra.txt"), "scratch");

      const io = captureIO();
      const code = await runLint(["**/*.tsx"], { cwd: sandbox, fix: true, force: true }, io);

      expect(code).toBe(0);
      const after = await readFile(join(sandbox, "Hero.tsx"), "utf8");
      const classAttr = after.match(/className="([^"]+)"/);
      expect(classAttr?.[1]).toContain("bg-brand-salmon");
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });
});
