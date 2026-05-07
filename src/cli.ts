#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve as resolvePath } from "node:path";
import { cac } from "cac";
import fastGlob from "fast-glob";
import { parseTheme, version } from "./index.js";
import { applyFixes } from "./lint/fix.js";
import { type FileResult, formatHuman, formatJson, formatSarif } from "./lint/format.js";
import { lintSource } from "./lint/linter.js";
import type { IrisLintMessage } from "./lint/types.js";

export type LintFormat = "human" | "json" | "sarif";

export type LintOptions = {
  cwd?: string;
  entry?: string;
  fix?: boolean;
  force?: boolean;
  allowPartial?: boolean;
  format?: LintFormat;
};

export type LintIO = {
  out: (line: string) => void;
  err: (line: string) => void;
};

const DEFAULT_TARGETS = ["**/*.{tsx,jsx,ts,js,mdx}"];

export async function runLint(paths: string[], options: LintOptions, io: LintIO): Promise<number> {
  const cwd = resolvePath(options.cwd ?? process.cwd());
  const targets = paths.length > 0 ? paths : DEFAULT_TARGETS;
  const format = options.format ?? "human";

  let theme: Awaited<ReturnType<typeof parseTheme>>;
  try {
    theme = await parseTheme({
      cwd: options.cwd,
      entry: options.entry,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    io.err(`iris: ${message}`);
    return 2;
  }

  let fatal = false;
  for (const w of theme.warnings) {
    const isFatal = w.kind === "config-bridge-failed" && !options.allowPartial;
    const tag = isFatal ? "error" : "warn";
    const where = w.file ? ` (${w.file})` : "";
    io.err(`iris ${tag} [${w.kind}]${where}: ${w.message}`);
    if (isFatal) fatal = true;
  }

  if (fatal) {
    io.err(
      "iris: aborting — at least one fatal warning surfaced. re-run with --allow-partial to continue anyway.",
    );
    return 2;
  }

  // --fix rewrites source files in place. Refuse on a dirty git tree so a
  // run mid-WIP doesn't overwrite uncommitted changes with no undo. --force
  // is the explicit override; outside a git repo the check is a no-op.
  if (options.fix === true && options.force !== true) {
    const { isWorkingTreeDirty } = await import("./lint/git-state.js");
    const state = await isWorkingTreeDirty(cwd);
    if (state.dirty) {
      io.err(
        `iris: refusing to run --fix with uncommitted changes (${state.reason ?? "working tree dirty"}). re-run with --force to override.`,
      );
      return 2;
    }
  }

  // Glob is silent on its own and skips node_modules/.git via the `dot:false`
  // and `ignore` flags below; the user's argv globs are interpreted relative
  // to `cwd` so paths in the output stay project-relative.
  const files = await fastGlob(targets, {
    cwd,
    absolute: true,
    dot: false,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
  });

  const results: FileResult[] = [];
  let errorCount = 0;
  let fixedFileCount = 0;
  let fixedCount = 0;
  for (const abs of files) {
    const source = await readFile(abs, "utf8");
    const filename = relative(cwd, abs).replace(/\\/g, "/");
    const messages = await lintSource(source, filename, theme);
    if (messages.length === 0) continue;

    if (options.fix === true) {
      const fixed = applyFixes(source, messages);
      if (fixed !== source) {
        await writeFile(abs, fixed, "utf8");
        fixedFileCount += 1;
        const remaining = messages.filter((m) => !isFixable(m));
        fixedCount += messages.length - remaining.length;
        if (remaining.length === 0) continue;
        results.push({ filename, messages: remaining });
        for (const m of remaining) {
          if (m.severity === "error") errorCount += 1;
        }
        continue;
      }
    }

    results.push({ filename, messages });
    for (const m of messages) {
      if (m.severity === "error") errorCount += 1;
    }
  }

  const out = renderOutput(results, format);
  if (out.length > 0) io.out(out.replace(/\n$/, ""));

  if (options.fix === true && fixedCount > 0) {
    io.err(
      `iris: rewrote ${fixedCount} class${fixedCount === 1 ? "" : "es"} in ${fixedFileCount} file${fixedFileCount === 1 ? "" : "s"}`,
    );
  }

  return errorCount > 0 ? 1 : 0;
}

function isFixable(m: IrisLintMessage): boolean {
  return m.suggestion?.kind === "exact" || m.suggestion?.kind === "near";
}

function renderOutput(results: FileResult[], format: LintFormat): string {
  switch (format) {
    case "json":
      return formatJson(results);
    case "sarif":
      return formatSarif(results);
    case "human":
      return formatHuman(results);
  }
}

function main(): void {
  const cli = cac("iris");

  cli
    .command(
      "lint [...paths]",
      "Lint files for arbitrary Tailwind values that bypass design tokens",
    )
    .option("--fix", "Apply suggested rewrites")
    .option("--force", "Bypass the working-tree-dirty check on --fix")
    .option("--cwd <path>", "Project root (defaults to current directory)")
    .option("--entry <path>", "Override the v4 CSS entry path (e.g. styles/main.css)")
    .option("--allow-partial", "Don't exit on config-bridge-failed warnings")
    .option(
      "--format <format>",
      "Output format: human (default), json (envelope), sarif (v2.1.0)",
      { default: "human" },
    )
    .action(async (paths: string[], options: LintOptions) => {
      const code = await runLint(paths, options, {
        out: (line) => process.stdout.write(`${line}\n`),
        err: (line) => process.stderr.write(`${line}\n`),
      });
      process.exit(code);
    });

  cli.help();
  cli.version(version);
  cli.parse();
}

// Only execute the cac wiring when this file is the entrypoint. Tests import
// runLint directly and must not trigger argv parsing on import.
const invokedAsScript = (() => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  const url = new URL(`file://${argv1.replace(/\\/g, "/")}`).href;
  return url === import.meta.url;
})();

if (invokedAsScript) {
  main();
}
