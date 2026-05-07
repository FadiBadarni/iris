// Cross-platform runner for `pnpm test:e2e`. Builds dist, then runs the
// e2e suite with IRIS_E2E=1 set in the child env. Avoids a cross-env dep.
import { spawnSync } from "node:child_process";


function run(commandLine, env) {
  // shell: true with a single command string keeps Windows + POSIX both happy
  // and avoids node's DEP0190 (args + shell: true).
  const result = spawnSync(commandLine, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("pnpm build");
run("pnpm exec vitest run test/cli-e2e.test.ts", { IRIS_E2E: "1" });
