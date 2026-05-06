#!/usr/bin/env node
import { cac } from "cac";
import { version } from "./index.js";

const cli = cac("iris");

cli
  .command("lint [...paths]", "Lint files for arbitrary Tailwind values that bypass design tokens")
  .option("--fix", "Apply suggested rewrites")
  .option("--config <path>", "Path to iris.config.ts")
  .action((paths: string[]) => {
    const targets = paths.length > 0 ? paths : ["**/*.{tsx,jsx,ts,js,mdx}"];
    console.error("iris lint is not implemented yet. tracking v0.1 in repo.");
    console.error(`targets: ${targets.join(", ")}`);
    process.exit(1);
  });

cli.help();
cli.version(version);

cli.parse();
