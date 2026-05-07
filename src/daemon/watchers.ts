// File watchers for the iris-daemon. Long-lived daemons hold warm caches
// across calls; without watchers, a user editing `tailwind.config.ts` or
// `iris.config.ts` would see stale lint results until daemon restart.
//
// chokidar fires on real fs events with cross-platform support. We watch:
//   - tailwind.config.{ts,js,mjs,cjs}        — invalidates theme cache
//   - **/*.css (excluding node_modules/dist) — covers v4 globals.css
//                                              and its @import chain
//   - iris.config.{ts,mjs,js}                — invalidates config cache
//
// Out of scope for v0.5 β: shadcn watching. parseShadcn does a fresh
// filesystem glob on every call (no in-memory cache to invalidate), so
// adding/removing components is picked up on the next /lint without any
// watcher work.

import { resolve as resolvePath } from "node:path";
import chokidar from "chokidar";

export type WatcherCallbacks = {
  /**
   * Called when a Tailwind config or any CSS file in the project tree
   * changes. The daemon should clear its theme cache so the next /lint
   * call re-parses.
   */
  onThemeChange: () => void | Promise<void>;
  /**
   * Called when `iris.config.{ts,mjs,js}` changes. The daemon should
   * drop its cached config for the project root so the next /lint call
   * picks up the new severity overrides / allowlist.
   */
  onConfigChange: () => void | Promise<void>;
};

export type DaemonWatchers = {
  close: () => Promise<void>;
};

/**
 * Spin up file watchers for a project root. Returns a `close()` the
 * daemon should call on shutdown so chokidar releases its inotify /
 * ReadDirectoryChangesW handles.
 */
export function createDaemonWatchers(
  projectRoot: string,
  callbacks: WatcherCallbacks,
): DaemonWatchers {
  const root = resolvePath(projectRoot);

  // Watch the project root recursively, then route events by basename
  // in the handler. This avoids chokidar's glob-startup limitation where
  // `**/*.css` doesn't recurse into subdirectories created AFTER startup
  // (a real case during a `pnpm create next-app` scaffold or any first
  // `mkdir src/styles && echo @theme > src/styles/globals.css` flow).
  // The directory-watch + filter-in-handler approach catches every
  // creation reliably.
  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    // Function-based ignore matches reliably across chokidar v5's glob
    // semantics on Windows + POSIX. We get the absolute path; reject
    // any segment matching our ignored dir names. Covers vendored deps,
    // build output, vcs, and the daemon's own runtime dir (which would
    // otherwise loop the moment we write the lock).
    ignored: (path) => /(^|[/\\])(node_modules|dist|\.git|\.iris)([/\\]|$)/.test(path),
    persistent: false,
  });

  watcher.on("all", (event, path) => {
    if (event !== "add" && event !== "change" && event !== "unlink") return;
    const base = path.split(/[\\/]/).pop() ?? "";
    if (isThemeFile(base)) {
      void callbacks.onThemeChange();
      return;
    }
    if (isConfigFile(base)) {
      void callbacks.onConfigChange();
      return;
    }
  });

  // chokidar emits "error" on inotify exhaustion, ENOPERM on a watched
  // directory, ReadDirectoryChangesW failures on Windows, etc. An
  // unhandled EventEmitter "error" event would crash the daemon —
  // surface to stderr so a misbehaving filesystem is debuggable, but
  // keep the daemon alive (the HTTP server can still serve /lint, the
  // user just loses live invalidation until restart).
  watcher.on("error", (err) => {
    process.stderr.write(
      `iris-daemon: file watcher error — live cache invalidation may stop: ${
        err instanceof Error ? err.message : String(err)
      }\n`,
    );
  });

  return {
    close: async () => {
      await watcher.close();
    },
  };
}

const TAILWIND_CONFIG_NAMES = new Set([
  "tailwind.config.ts",
  "tailwind.config.js",
  "tailwind.config.mjs",
  "tailwind.config.cjs",
]);

const IRIS_CONFIG_NAMES = new Set(["iris.config.ts", "iris.config.mjs", "iris.config.js"]);

function isThemeFile(basename: string): boolean {
  // package.json counts as theme-relevant: detectVersion() reads it to
  // pick the v3 vs v4 path, and adding/removing tailwindcss or a plugin
  // there changes the resolved theme. False invalidations on unrelated
  // package.json edits (version bumps, scripts) cost one parseTheme
  // re-run on the next /lint — cheap and self-healing.
  return (
    TAILWIND_CONFIG_NAMES.has(basename) || basename === "package.json" || basename.endsWith(".css")
  );
}

function isConfigFile(basename: string): boolean {
  return IRIS_CONFIG_NAMES.has(basename);
}
