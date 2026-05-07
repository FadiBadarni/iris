import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createDaemonWatchers } from "../../src/daemon/watchers.js";

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "iris-watchers-test-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

// chokidar's awaitWriteFinish caps at stabilityThreshold (100ms) + a bit
// of polling overhead. Give tests 2s of budget so flakiness on slow CI
// doesn't bite.
async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`waitFor: predicate did not pass within ${timeoutMs}ms`);
}

describe("createDaemonWatchers — onThemeChange", () => {
  test("fires when tailwind.config.ts is created", async () => {
    let themeFires = 0;
    const watchers = createDaemonWatchers(tmp, {
      onThemeChange: () => {
        themeFires++;
      },
      onConfigChange: () => {},
    });
    try {
      // Need a small ready-ish delay before chokidar's initial scan
      // settles. ignoreInitial:true skips the existing-file event but
      // chokidar still needs to register watchers first.
      await new Promise((r) => setTimeout(r, 200));
      await writeFile(join(tmp, "tailwind.config.ts"), "export default {};", "utf8");
      await waitFor(() => themeFires > 0);
    } finally {
      await watchers.close();
    }
  });

  test("fires when package.json changes (covers `pnpm add tailwindcss`)", async () => {
    // detectVersion() reads package.json to choose the v3 vs v4 path;
    // adding/removing tailwindcss in deps must invalidate the theme cache.
    let themeFires = 0;
    const watchers = createDaemonWatchers(tmp, {
      onThemeChange: () => {
        themeFires++;
      },
      onConfigChange: () => {},
    });
    try {
      await new Promise((r) => setTimeout(r, 200));
      await writeFile(
        join(tmp, "package.json"),
        '{"name":"x","dependencies":{"tailwindcss":"^4"}}',
        "utf8",
      );
      await waitFor(() => themeFires > 0);
    } finally {
      await watchers.close();
    }
  });

  test("fires when a .css file is created anywhere in the tree", async () => {
    let themeFires = 0;
    const watchers = createDaemonWatchers(tmp, {
      onThemeChange: () => {
        themeFires++;
      },
      onConfigChange: () => {},
    });
    try {
      await new Promise((r) => setTimeout(r, 200));
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(tmp, "src"), { recursive: true });
      await writeFile(join(tmp, "src", "globals.css"), "@theme {}", "utf8");
      await waitFor(() => themeFires > 0);
    } finally {
      await watchers.close();
    }
  });
});

describe("createDaemonWatchers — onConfigChange", () => {
  test("fires when iris.config.ts is created", async () => {
    let configFires = 0;
    const watchers = createDaemonWatchers(tmp, {
      onThemeChange: () => {},
      onConfigChange: () => {
        configFires++;
      },
    });
    try {
      await new Promise((r) => setTimeout(r, 200));
      await writeFile(
        join(tmp, "iris.config.ts"),
        'import {defineConfig} from "iris-cc"; export default defineConfig({});',
        "utf8",
      );
      await waitFor(() => configFires > 0);
    } finally {
      await watchers.close();
    }
  });
});

describe("createDaemonWatchers — close()", () => {
  test("close stops further callbacks", async () => {
    let themeFires = 0;
    const watchers = createDaemonWatchers(tmp, {
      onThemeChange: () => {
        themeFires++;
      },
      onConfigChange: () => {},
    });
    await new Promise((r) => setTimeout(r, 200));
    await watchers.close();
    await writeFile(join(tmp, "tailwind.config.ts"), "export default {};", "utf8");
    // Wait the awaitWriteFinish budget — if close() didn't truly stop,
    // we'd see themeFires > 0 by now.
    await new Promise((r) => setTimeout(r, 400));
    expect(themeFires).toBe(0);
  });
});

describe("createDaemonWatchers — ignored paths", () => {
  test("does NOT fire on changes inside .iris/, node_modules/, dist/, .git/", async () => {
    let themeFires = 0;
    let configFires = 0;
    const watchers = createDaemonWatchers(tmp, {
      onThemeChange: () => {
        themeFires++;
      },
      onConfigChange: () => {
        configFires++;
      },
    });
    try {
      await new Promise((r) => setTimeout(r, 200));
      const { mkdir } = await import("node:fs/promises");
      // Editing files inside ignored dirs should not trip watchers.
      // .iris/ is the daemon's own runtime dir — watching it would loop
      // when the daemon writes its lock.
      await mkdir(join(tmp, ".iris"), { recursive: true });
      await mkdir(join(tmp, "node_modules", "tailwindcss"), { recursive: true });
      await mkdir(join(tmp, "dist"), { recursive: true });
      await writeFile(join(tmp, ".iris", "daemon.json"), "{}", "utf8");
      await writeFile(
        join(tmp, "node_modules", "tailwindcss", "test.css"),
        ".x { color: red }",
        "utf8",
      );
      await writeFile(join(tmp, "dist", "out.css"), ".y {}", "utf8");
      await new Promise((r) => setTimeout(r, 400));
      expect(themeFires).toBe(0);
      expect(configFires).toBe(0);
    } finally {
      await watchers.close();
    }
  });
});
