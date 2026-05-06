#!/usr/bin/env node
import { cac } from "cac";
import { parseTheme, version } from "./index.js";

const cli = cac("iris");

cli
  .command("lint [...paths]", "Lint files for arbitrary Tailwind values that bypass design tokens")
  .option("--fix", "Apply suggested rewrites")
  .option("--cwd <path>", "Project root (defaults to current directory)")
  .action(async (paths: string[], options: { cwd?: string; fix?: boolean }) => {
    const targets = paths.length > 0 ? paths : ["**/*.{tsx,jsx,ts,js,mdx}"];

    try {
      const theme = await parseTheme({ cwd: options.cwd });
      const tokenCount = theme.tokens.size;
      const sourceCount = theme.sources.length;
      console.log(
        `iris: parsed tailwind v${theme.version} theme — ${tokenCount} tokens across ${sourceCount} source file(s)`,
      );
      console.error("lint engine not implemented yet — parser ready, rules land in the next phase");
      console.error(`targets: ${targets.join(", ")}`);
      process.exit(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`iris: ${message}`);
      process.exit(2);
    }
  });

cli.help();
cli.version(version);

cli.parse();
