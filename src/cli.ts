#!/usr/bin/env node
import { cac } from "cac";
import { parseTheme, version } from "./index.js";

export type LintOptions = {
  cwd?: string;
  entry?: string;
  fix?: boolean;
  allowPartial?: boolean;
};

export type LintIO = {
  out: (line: string) => void;
  err: (line: string) => void;
};

export async function runLint(paths: string[], options: LintOptions, io: LintIO): Promise<number> {
  const targets = paths.length > 0 ? paths : ["**/*.{tsx,jsx,ts,js,mdx}"];

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

  const tokenCount = theme.tokens.size;
  const sourceCount = theme.sources.length;
  io.out(
    `iris: parsed tailwind v${theme.version} theme — ${tokenCount} tokens across ${sourceCount} source file(s)`,
  );

  if (fatal) {
    io.err(
      "iris: aborting — at least one fatal warning surfaced. re-run with --allow-partial to continue anyway.",
    );
    return 2;
  }

  io.err("lint engine not implemented yet — parser ready, rules land in the next phase");
  io.err(`targets: ${targets.join(", ")}`);
  return 1;
}

function main(): void {
  const cli = cac("iris");

  cli
    .command(
      "lint [...paths]",
      "Lint files for arbitrary Tailwind values that bypass design tokens",
    )
    .option("--fix", "Apply suggested rewrites")
    .option("--cwd <path>", "Project root (defaults to current directory)")
    .option("--entry <path>", "Override the v4 CSS entry path (e.g. styles/main.css)")
    .option("--allow-partial", "Don't exit on config-bridge-failed warnings")
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
