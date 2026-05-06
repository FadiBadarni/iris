#!/usr/bin/env node
import { cac } from "cac";
import { parseTheme, version } from "./index.js";

const cli = cac("iris");

cli
  .command("lint [...paths]", "Lint files for arbitrary Tailwind values that bypass design tokens")
  .option("--fix", "Apply suggested rewrites")
  .option("--cwd <path>", "Project root (defaults to current directory)")
  .option("--entry <path>", "Override the v4 CSS entry path (e.g. styles/main.css)")
  .option("--allow-partial", "Don't exit on config-bridge-failed warnings")
  .action(
    async (
      paths: string[],
      options: { cwd?: string; entry?: string; fix?: boolean; allowPartial?: boolean },
    ) => {
      const targets = paths.length > 0 ? paths : ["**/*.{tsx,jsx,ts,js,mdx}"];

      try {
        const theme = await parseTheme({
          cwd: options.cwd,
          entry: options.entry,
        });

        let fatal = false;
        for (const w of theme.warnings) {
          const isFatal = w.kind === "config-bridge-failed" && !options.allowPartial;
          const tag = isFatal ? "error" : "warn";
          const where = w.file ? ` (${w.file})` : "";
          console.error(`iris ${tag} [${w.kind}]${where}: ${w.message}`);
          if (isFatal) fatal = true;
        }

        const tokenCount = theme.tokens.size;
        const sourceCount = theme.sources.length;
        console.log(
          `iris: parsed tailwind v${theme.version} theme — ${tokenCount} tokens across ${sourceCount} source file(s)`,
        );

        if (fatal) {
          console.error(
            "iris: aborting — at least one fatal warning surfaced. re-run with --allow-partial to continue anyway.",
          );
          process.exit(2);
        }

        console.error(
          "lint engine not implemented yet — parser ready, rules land in the next phase",
        );
        console.error(`targets: ${targets.join(", ")}`);
        process.exit(1);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`iris: ${message}`);
        process.exit(2);
      }
    },
  );

cli.help();
cli.version(version);

cli.parse();
