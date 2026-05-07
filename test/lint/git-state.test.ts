import { execSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { isWorkingTreeDirty } from "../../src/lint/git-state.js";

// Each test gets a fresh tmp dir so git state across tests can't leak. The
// dir is initialized into a real git repo where applicable so we exercise
// the actual `git status --porcelain` output rather than a mock.

describe("isWorkingTreeDirty", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "iris-git-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("returns dirty=false in a non-git directory", async () => {
    const result = await isWorkingTreeDirty(dir);
    expect(result.dirty).toBe(false);
    expect(result.reason).toBe("not a git repo");
  });

  test("returns dirty=false in a clean git repo", async () => {
    execSync("git init", { cwd: dir });
    execSync('git config user.email "t@t.test"', { cwd: dir });
    execSync("git config user.name t", { cwd: dir });
    await writeFile(join(dir, "README.md"), "hi");
    execSync("git add .", { cwd: dir });
    execSync('git commit -m "init"', { cwd: dir });
    const result = await isWorkingTreeDirty(dir);
    expect(result.dirty).toBe(false);
  });

  test("returns dirty=true with a reason when the tree has changes", async () => {
    execSync("git init", { cwd: dir });
    execSync('git config user.email "t@t.test"', { cwd: dir });
    execSync("git config user.name t", { cwd: dir });
    await writeFile(join(dir, "README.md"), "hi");
    execSync("git add .", { cwd: dir });
    execSync('git commit -m "init"', { cwd: dir });
    await writeFile(join(dir, "README.md"), "modified");
    const result = await isWorkingTreeDirty(dir);
    expect(result.dirty).toBe(true);
    expect(result.reason).toMatch(/README\.md/);
  });
});
