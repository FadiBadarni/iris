import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { version } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "..", "dist", "cli.js");

const run = (args: string[]) => {
  try {
    return {
      stdout: execFileSync("node", [cliPath, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
      code: 0,
    };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (e.stdout ?? "") + (e.stderr ?? ""),
      code: e.status ?? 1,
    };
  }
};

describe("iris cli", () => {
  it("exports the package version", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("prints version with --version", () => {
    const { stdout, code } = run(["--version"]);
    expect(code).toBe(0);
    expect(stdout).toContain(version);
  });

  it("prints help with --help", () => {
    const { stdout, code } = run(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("iris");
    expect(stdout).toContain("lint");
  });

  it("lint subcommand exits non-zero with not-implemented notice", () => {
    const { stdout, code } = run(["lint"]);
    expect(code).toBe(1);
    expect(stdout).toContain("not implemented");
  });
});
