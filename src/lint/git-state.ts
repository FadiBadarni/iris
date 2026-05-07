import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

// Used by the CLI to gate destructive --fix runs. iris rewrites source files
// in place; running --fix mid-WIP would overwrite uncommitted work with no
// undo. Returning {dirty: true} lets the CLI refuse and surface --force as
// the explicit override. Failures (git not installed, repo corrupt) collapse
// to "not a git repo" so the safety check never blocks the fix on
// infrastructure issues — the user can always git-commit before iris runs.

export type GitState = {
  dirty: boolean;
  reason: string | null;
};

export async function isWorkingTreeDirty(cwd: string): Promise<GitState> {
  try {
    const { stdout } = await exec("git", ["status", "--porcelain"], {
      cwd,
      timeout: 5000,
    });
    const trimmed = stdout.trim();
    if (trimmed.length === 0) {
      return { dirty: false, reason: null };
    }
    // First line carries the most-recently-touched file in human-readable
    // shape (e.g. " M README.md") — surfacing it gives the user something
    // concrete to grep without dumping the full status.
    return { dirty: true, reason: trimmed.split(/\r?\n/)[0] ?? trimmed };
  } catch {
    // git not installed, not a repo, or the call timed out. The safety
    // check is best-effort; never block the user on infra failures.
    return { dirty: false, reason: "not a git repo" };
  }
}
