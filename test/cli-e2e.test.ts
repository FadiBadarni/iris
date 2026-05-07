// E2E smoke against the built dist/cli.js. Gated behind IRIS_E2E=1 so the
// default `pnpm test` stays in-process and never reads stale dist. Wire it
// via `pnpm test:e2e` which runs tsup first.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { version } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "..", "dist", "cli.js");
const e2eEnabled = process.env.IRIS_E2E === "1";

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

describe.skipIf(!e2eEnabled)("iris cli (e2e)", () => {
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

  it("lint runs end-to-end against a v3 fixture", () => {
    const fixturePath = resolve(here, "fixtures", "v3-basic");
    const { stdout, code } = run(["lint", "--cwd", fixturePath]);
    expect(code).toBe(1);
    expect(stdout).toContain("parsed tailwind v3 theme");
  });
});
