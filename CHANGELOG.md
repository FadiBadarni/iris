# Changelog

All notable changes to iris are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] — 2026-05-07

Production performance. The Claude Code hook now runs against a long-running per-project `iris-daemon` that holds warm theme + config caches across calls (shadcn detection runs fresh each call — cheap, no in-memory state to keep). The first daemon use for a project pays the hook startup + daemon spawn + first parse cost; every subsequent healthy-daemon call is a loopback HTTP POST, well under the <200ms CLAUDE.md budget that previous versions blew through at 450–570ms each call. Minor bump because the public surface grows: a new `iris-daemon` bin, the daemon's HTTP `/lint` and `/health` endpoints, and a new `IRIS_NO_DAEMON` env-var contract. The existing `iris-hook`, `iris-mcp`, and `iris` bins keep their behavior; programmatic API is unchanged.

### Added

- **`iris-daemon` binary.** Spawned by the hook on first call (per project root); holds warm caches; idles out after 10 minutes. Loopback HTTP only (`127.0.0.1:<random-port>`), authenticated via a 32-byte hex token written to `<projectRoot>/.iris/daemon.json` with mode 0o600. Two endpoints: `POST /lint` (the same engine as the in-process path; returns `{ violations: IrisLintMessage[] }`) and `GET /health` (`{ status, version, uptimeMs, pid }` — no auth).
- **`iris-daemon status` / `stop` subcommands.** Operator surface for triage. `status` prints pid/port/uptime/version; `stop` SIGTERMs the daemon, waits for exit, and clears the lock — ownership-checked so we don't kill an unrelated process whose PID was reused. Both default to cwd; pass `--project-root <path>` for monorepos.
- **chokidar file watchers inside the daemon.** Edits to `tailwind.config.{ts,js,mjs,cjs}`, any `.css` file in the project tree, or `package.json` (where `detectVersion` reads the tailwind major) clear the theme cache. Edits to `iris.config.{ts,mjs,js}` clear the config cache. Live invalidation across calls without restart.
- **`IRIS_NO_DAEMON` env var.** Set to anything except `""`/`"0"`/`"false"`/`"no"`/`"off"` (case-insensitive) to skip the daemon entirely and force the in-process path. Useful for sandboxed environments without process-spawn permission, debugging, or filing an issue with a clean baseline. Silent — no "daemon path failed" stderr noise on opt-out.
- **Hook fast-fail for non-tailwind projects.** Walks ancestors from the edited file looking for `tailwind.config.*`; exits silently with no daemon spawn when none is found. Previously the daemon would have started, returned 500 on `/lint`, and the hook would have fallen back to the in-process path — wasted work.
- **Performance README section.** Documents the daemon model, watchers, lifecycle commands, fallback behavior, opt-out, and known limitations.

### Changed

- **Hook latency profile.** Cold first call still pays Node startup + parseTheme; every warm call after is a loopback POST. The headline budget was <200ms warm; this hits it.
- **Hook integration.** `iris-hook` now tries the daemon path first, falls back to in-process resolution on any failure (spawn failure, port unreachable, version mismatch, malformed response). The fallback writes a one-line stderr diagnostic visible in `claude --debug`.
- **Embedded MCP server identity.** `Server({ name: "iris", version: "0.4.0" })` → `"0.5.0"`.
- **Daemon `/health` includes `pid`.** Identity check for `status` / `stop`: a foreign loopback listener could return 200 on the recorded port, but won't return our pid + version. Lets clients prove they're talking to the daemon they expect.
- **Lock-file shape.** `<projectRoot>/.iris/daemon.json` records `{ pid, port, token, version, startedAt }`. Mode 0o600 (same trust boundary as a project-local `.npmrc`). `.iris/` is gitignored and biome-ignored.

### Risks

- **v4 CSS-first projects without a JS config don't trigger the daemon.** `hasTailwindSignal` requires an ancestor `tailwind.config.*`. Drop a stub `export default {}` to opt in. Documented in README.
- **Slow cold parses can exceed the 5s `/lint` timeout.** Projects whose `tailwind.config.ts` evaluation takes >5s on a cold daemon (heavy plugin chains, slow filesystem, antivirus scanning) will see the hook log a fallback diagnostic and re-parse in-process. Subsequent calls hit the warm daemon and are fast. Bump the timeout if the fallback fires repeatedly.
- **Failed non-default `@config "./tailwind.legacy.ts"` recovery.** If the bridge target was missing initially and the user later creates it, the watcher won't pick up the .ts file (basename filter only covers `tailwind.config.*` and `.css`). Run `iris-daemon stop` to pick up the fix.

### Dependencies

- `chokidar@^5.0.0` (new runtime dep). 30 KB. Used by the daemon's file watchers.

### Deferred to v0.6+

- `add_component` MCP tool (shells `npx shadcn add`)
- Structural similarity matching for the shadcn rule
- Detection of non-shadcn libraries (Radix, Headless UI)
- The shadcn-aware `--fix` rewriter
- Visual QA Phase 2 (Playwright + axe-core)
- Adoption telemetry
- Cross-project shared daemon (single process serving multiple roots)
- Per-root theme cache invalidation (avoid the cross-daemon eviction risk above)

## [0.4.0] — 2026-05-07

Production-ready: configurability + proactive AI surface. iris now reads an optional `iris.config.ts` for per-rule severity overrides and user-customizable allowlist patterns, and the MCP server gains two new tools (`apply_fix`, `get_token_map`) so the AI can self-correct in one round-trip rather than read+lint+write across three tool calls. Minor bump (not patch) because the public surface grows: new `loadConfig` / `defineConfig` exports, new `IrisConfig` / `IrisRuleSeverity` types, a fifth optional argument on `lintSource`, and two new MCP tools. The existing `lintSource(source, filename, theme?, shadcn?)` signature stays valid — v0.3 users get no surprises if they don't opt in.

### Added

- **`iris.config.ts` loader** (slice α). Drop an `iris.config.{ts,mjs,js}` at the project root and the CLI, hook, and MCP server all pick it up. Two knobs on day one: `rules` (per-rule severity overrides — `"off"` / `"warn"` / `"error"`) and `allowlist` (extra regex patterns appended to `DEFAULT_ALLOWLIST`, accepting either string patterns or RegExp instances). `defineConfig` is an identity helper for type inference, same shape as Vite/Vitest/Tailwind. Loader uses jiti 2.x with `interopDefault` for first-class TypeScript configs.
- **`apply_fix` MCP tool** (slice β). `apply_fix({ source, filename, projectRoot? }) → { source, applied, remaining }`. Server-side equivalent of `iris lint --fix` — submit a draft, get rewritten source back. The `remaining` field carries violations the engine had no fix for (ambiguous matches, no token match, or warning-only rules like `iris/no-reinventing-shadcn`). The handler re-lints the rewritten source so `remaining` carries post-fix line/column positions.
- **`get_token_map` MCP tool** (slice γ). `get_token_map({ projectRoot? }) → { tokens: TokenEntry[] }`. Mirrors `list_components` for the theme — proactive AI query for "what tokens exist?" so the AI reaches for project tokens instead of arbitrary values. Returns the full `TokenEntry` shape (`{ name, value, type, source, file }`) for every resolved token, including v4 defaults; `source` lets a consumer filter by origin if they want only project-defined entries.
- **`lintSource` accepts a fifth optional `config?: IrisConfig` argument.** When provided, severity overrides apply post-rule (rewriting `msg.severity` or dropping the message when `"off"`) and allowlist additions extend `DEFAULT_ALLOWLIST` for the same lint pass.
- **CLI / hook / MCP auto-load `iris.config.*`.** `npx iris lint`, `iris-hook`, and `iris-mcp` all call `loadConfig` for the inferred project root and thread it through. CLI exits 2 on a malformed config (the user invoked the linter intentionally; loud failure is correct). Hook + MCP swallow + log to stderr and fall back to defaults so a typo doesn't freeze every Claude Code tool call.
- **`examples/iris.config.ts`** — copy-paste-ready `defineConfig({...})` example with both knobs and inline comments. README has a new "Configuration" section linking it.

### Changed

- **`createIrisMcpServer` `CreateServerOpts`.** New optional `resolveConfig` injection paralleling `resolveShadcn`. Errors are swallowed on the lint and apply paths (a flaky config resolver shouldn't break linting).
- **`ResolveTheme` signature.** `filename` is now optional, parallel to `ResolveShadcn`. `get_token_map` has no file context to anchor on; `lint_source` and `apply_fix` still pass it for project-root inference.
- **MCP daemon staleness fix.** Replaced the resolved-value caches for theme and shadcn with in-flight promise coalescing keyed by project root. The previous outer cache held a parsed `ResolvedTheme` forever and bypassed `parseTheme`'s mtime cache (`src/theme/cache.ts`), so editing `tailwind.config.*` or adding a new shadcn component wouldn't surface until daemon restart. Coalescing dedups concurrent calls; settle deletes the entry; next call hits `parseTheme` / `parseShadcn` fresh.
- **Loader runtime validation.** `loadConfig` now rejects malformed configs at startup rather than silently no-opping mid-lint: invalid severity strings (`"warning"` instead of `"warn"`), non-array `allowlist`, non-string/RegExp items, malformed regex patterns. The CLI surfaces these and exits 2.
- **`g`/`y` flags stripped on user RegExps.** `RegExp.prototype.test` carries `lastIndex` state for global / sticky regexes, so a stateful pattern would alternate between matching and missing on repeated calls. `combineAllowlist` now clones user RegExps without those flags.
- **Severity overrides key against the raw ESLint `ruleId`.** `toIrisMessage` defaults a missing `ruleId` to `"unknown"` for presentation. Without the fix, `rules: { "unknown": "off" }` would have silenced every parser/internal diagnostic ESLint emits without a ruleId.
- **Embedded MCP server identity.** `Server({ name: "iris", version: "0.3.0" })` → `"0.4.0"` so `tools/list` responses advertise the right version.
- **README expanded.** New "Configuration" section between "MCP server" and "shadcn awareness". The MCP server section now lists all four tools with their input/output shapes. Roadmap split. Stale v0.3.0 references throughout updated.
- **MCP example configs corrected.** `examples/mcp/{claude-code,cursor}.json` now use `npx -y -p iris-cc iris-mcp` so npx can resolve the bin without a project-local install. Previously `npx -y iris-mcp` failed because npm has no `iris-mcp` package; the bin lives in `iris-cc`.

### Risks

- **`iris.config.*` is project-root only.** No per-directory configs, no `extends`, no JSON. All additive on the existing shape if real demand surfaces.
- **No way to remove default allowlist patterns.** Users can append, not subtract. Trade for the simpler day-one shape.
- **Sticky-null config cache in the MCP daemon.** Broken configs cache as `null` so a daemon doesn't pound the FS on every tool call; fixing the config requires daemon restart for the MCP surface (CLI / hook re-load every invocation).

### Dependencies

- `jiti@^2.7.0` (new runtime dep). 1 MB. Used by the config loader to load TS/MJS/JS configs without a build step. ESM-first, used by Vite/Nuxt — proven shape.

### Deferred to v0.5+

- Persistent hook process for sub-200ms cold-start (architectural; current is 450–570ms — over the CLAUDE.md budget by >2x but not a blocker users have surfaced yet)
- Theme file watcher (carry-over)
- `add_component` MCP tool (shells `npx shadcn add`)
- Structural similarity matching for the shadcn rule
- Detection of non-shadcn libraries (Radix, Headless UI)
- The shadcn-aware `--fix` rewriter that imports the canonical component
- Visual QA Phase 2 (Playwright + axe-core, gated on user demand)
- Adoption telemetry

## [0.3.0] — 2026-05-07

shadcn awareness. iris now detects installed shadcn/ui components, flags reinvented locals, and exposes the component list to AI assistants over MCP. Minor bump (not patch) because the public surface grows: new `parseShadcn` export, new `ShadcnState`/`ShadcnComponent`/`ShadcnWarning` types, a fourth optional argument on `lintSource`, and a second MCP tool. The existing `lintSource(source, filename, theme?)` signature stays valid — v0.2.x users get no surprises if they don't opt in.

### Added

- **`parseShadcn({ cwd })`.** Reads `components.json` (when present) for the `aliases.ui` path; otherwise globs `**/components/ui/*.{ts,tsx}`. Returns a `ShadcnState` with a Map of canonical names → `{ filePath, importPath }`. Filters support files (`index.tsx`, `*.test.tsx`, `*.d.ts`, `*.stories.tsx`) so the Map only contains real components. PascalCases kebab-case stems (`alert-dialog.tsx` → `AlertDialog`). Surfaces `no-shadcn` and `multi-shadcn` warnings rather than throwing.
- **`iris/no-reinventing-shadcn` lint rule.** Warns when a file declares a function or const named after an installed shadcn component without already importing it from the canonical alias path. Visitor coverage matches what AI assistants actually emit: function declarations (incl. default-exported), arrow / function-expression consts, and call-expression wrappers (`forwardRef(...)`, `memo(...)` — the shadcn-canonical shape). Suppression on the canonical implementation file and on existing value imports; type-only imports do not suppress.
- **`list_components` MCP tool.** Second tool exposed by `iris-mcp`: `list_components({ projectRoot? }) → { components: ShadcnComponent[] }`. Lets an AI proactively query installed components before generating JSX. Empty array (not an error) on non-shadcn projects so the AI can fall through to default generation rather than treating "no shadcn" as a failure.
- **`lintSource` accepts a fourth optional `shadcn?: ShadcnState` argument.** When provided, the rule registers under the `iris/` namespace alongside the wrapped `tailwindcss/*` rules. Cached per ShadcnState by reference identity so swapping shadcn states between calls doesn't serve a stale config.
- **CLI / hook / MCP auto-wire shadcn detection.** `npx iris lint`, `iris-hook`, and `iris-mcp` all call `parseShadcn` for the inferred project root and thread the state into `lintSource`. Hook stays warning-aware: shadcn reinventions surface as coaching context (one-line `iris warn [multi-shadcn]: ...` for monorepo ambiguity, `Reinventing <Button>...` from the lint pass) without blocking the tool call.

### Changed

- **`createIrisMcpServer` `CreateServerOpts`.** New optional `resolveShadcn` injection, called both during `lint_source` (for the rule) and `list_components` (for the tool payload). Errors are swallowed on the lint path (a flaky shadcn detector should never break linting) and surfaced via `isError: true` on `list_components` (where shadcn is the entire point of the call).
- **MCP `lintSource` handler accepts `physicalFilename`.** New two-channel filename pattern: `filename` is set to the basename so ESLint's flat-config glob matches Windows-absolute paths with drive letters; `physicalFilename` carries the full forward-slash path through to rules that need it. The shadcn rule reads `physicalFilename ?? filename` so canonical-file suppression compares apples to apples against `ShadcnComponent.filePath`.
- **Embedded MCP server identity.** `Server({ name: "iris", version: "0.2.1" })` → `"0.3.0"` so `tools/list` responses advertise the right version.

### Risks

- **Custom (non-shadcn) `components/ui/` directories falsely classified.** Accepted — the rule still benefits ("don't reinvent your own local component"). v0.4 can read each file's header for shadcn's marker comment if needed.
- **Monorepos with multiple `components/ui/` dirs.** Shallowest wins (depth-first, then lexicographic); others surface as `multi-shadcn` warnings. Pass `projectRoot` to scope detection.
- **No CLI/hook/MCP opt-out flag for shadcn detection.** Programmatic callers can opt out by omitting the fourth `lintSource` argument. A config-driven opt-out can land in v0.4 if there's demand.

### Deferred to v0.4+

- `--fix` rewriter that imports the shadcn component (needs surrounding-file rewriting; semver-major risk)
- Structural similarity matching (component looks like a Button without being named Button)
- Detection of non-shadcn libraries (Radix, Headless UI)
- `add_component` MCP tool (shells to `npx shadcn add`)
- iris.config.ts opt-out / severity overrides for the shadcn rule
- (Carry-overs from v0.2.2: persistent hook process, theme file watcher, additional MCP tools)

## [0.2.2] — 2026-05-07

Polish release closing three CHANGELOG-deferred items from v0.2.1. No breaking changes; the public contract (`lintSource`, `IrisLintMessage`, `SuggestResult`) is unchanged.

### Added

- **OKLab color near-match.** `bg-[#fa8073]` (one digit off from a project's `colors.brand.salmon = #fa8072`) now suggests `bg-brand-salmon` via perceptual distance. Conservative thresholds — strong-near at OKLab Δ ≤ 0.05, hard cap 0.15 — bias toward fewer-but-confident suggestions. Previous v0.2.1 behavior (color near-match returns `kind: 'none'`) was a known limitation; this closes it.
- **`--force` flag for `iris lint --fix`.** Required to bypass the new working-tree-dirty refusal (see Changed).
- **`pnpm test:e2e` is functional again.** The e2e gate (`IRIS_E2E=1`) builds dist and runs the binary against the v0.2.1 CLI's actual output. The previous lint assertion was stale from slice A.

### Changed

- **`iris lint --fix` refuses on a dirty git tree.** Source rewriting in place was unsafe mid-WIP; v0.2.1 had no guard. v0.2.2 calls `git status --porcelain` before fixing and exits 2 with an actionable message naming the offending file when the tree has uncommitted changes. `--force` bypasses; outside a git repo (e.g. the user hasn't `git init`-ed yet), the check is a no-op so iris doesn't refuse to work in fresh projects.

### Dependencies

- `culori@^4` (new runtime dep). Used by the OKLab near-match path; tree-shakeable, ESM-first, parses hex/rgb/hsl/oklch/named colors uniformly.
- `@types/culori` (devDep).

### Deferred to v0.2.3+

- Persistent hook process for sub-200ms cold-start (still architectural; needs IPC design)
- Theme file watcher (mtime cache catches most cases)
- Additional MCP tools beyond `lint_source` (`get_token_map`, `apply_fix`)
- iris.config.ts user-customizable allowlist
- Adoption telemetry

[0.2.2]: https://github.com/FadiBadarni/iris/releases/tag/v0.2.2

## [0.2.1] — 2026-05-07

The first publishable release. Ships the v0.1 lint engine plus two new surfaces (Claude Code hook, MCP server) on top of a stable public contract.

The npm package name is **`iris-cc`** — the bare `iris` name on npm was already taken by an unrelated, dormant package. The repo, project name, and bin names (`iris`, `iris-hook`, `iris-mcp`) stay unchanged; only the import specifier is `iris-cc` (and `iris-cc/lint` for the subpath).

### Added

- **`npx iris lint` CLI.** Tailwind-aware lint engine wrapping `eslint-plugin-tailwindcss`. Catches arbitrary values (`bg-[#f3f4f6]`) and unknown classnames against the project's resolved tokens, with semantic suggestions (`bg-muted`, `text-sm`) drawn from the parsed `tailwind.config.{ts,js}` (v3) or `globals.css @theme` (v4). Supports `--fix` for in-place rewriting and `--format human|json|sarif` output.
- **Allowlist for legitimate arbitrary values.** Built-in patterns cover `bg-[url(...)]`, `bg-[image:...]`, `var(--*)` anywhere, `grid-cols-[*fr*]`, `clip-path-[*]`, `content-[*]`, and any arbitrary-property class (`[mask-image:...]`, `[mask-size:auto]`, etc.).
- **Programmatic API.** `lintSource(source, filename, theme?)` and `parseTheme({cwd})` exported from the `iris` package; same `lintSource` reachable via the `iris/lint` subpath for adapters that don't need the CLI surface.
- **`iris-hook` Claude Code PreToolUse hook.** Stdin → JSON tool event in, `{decision:"block", reason}` out. Wires into `.claude/settings.json` with one line. Hook fires only on `.tsx`/`.jsx`/`.mdx`; warnings inform but only error-severity violations block. Example settings + skill in [`examples/claude-code/`](examples/claude-code/).
- **`iris-mcp` MCP server.** Single `lint_source(source, filename, projectRoot?) → { violations: IrisLintMessage[] }` tool over stdio, built on `@modelcontextprotocol/sdk`. Returns both `content` (JSON-encoded text) and `structuredContent` for forward-compat. Theme resolution caches per project root with Windows path normalization. Example MCP configs for Claude Code and Cursor in [`examples/mcp/`](examples/mcp/).
- **Public type exports.** `IrisLintMessage`, `SuggestResult` (`exact | near | ambiguous | none`), `IrisLintSeverity`, `SuggestCandidate`.

### Changed

- `tailwindcss` is now a peer dependency (`^3.4.0 || ^4.0.0`), reflecting the parser's design that resolves the user's installed version rather than shipping its own. Existing v0.1 users would have implicitly resolved it as a regular dep; this is a soft contract change.
- Build emits four entries: `dist/index.js`, `dist/cli.js`, `dist/lint/index.js`, `dist/hook/cli.js`, `dist/mcp/cli.js`. Bundle size dropped 400× (14 MB → 34 KB per entry) once `eslint`, `eslint-plugin-tailwindcss`, and `@typescript-eslint/parser` moved out of `devDependencies`.

### Deferred to v0.2.2+

- Persistent hook process (current cold-start is ~450-570ms per Claude Code Write/Edit/MultiEdit, over the <200ms budget in CLAUDE.md)
- Theme file watcher (the parser's mtime cache catches `globals.css`/`tailwind.config.ts` changes; out-of-band edits aren't detected)
- OKLab ΔE color near-match (exact + numeric near-match for spacing/fontSize ship today; color near-match needs `culori`)
- Git-dirty-tree refusal for `--fix` (currently unconditional; an explicit `--force` flag will gate it)
- Additional MCP tools beyond `lint_source` (`get_token_map`, `apply_fix`)
- Adoption telemetry / call-rate metrics for the MCP tool

### Acknowledgements

Architecture, debate gates, and code reviews surfaced via multi-LLM dispatch (codex, gemini, copilot) at every milestone. Top-of-mind risks the providers flagged that shaped this release: single-quote handling in extracted classnames, negative arbitrary spacing (`-mt-[8px]`), config-synth collisions on token-name flattening, plugin stderr noise without a config, Windows path normalization in the daemon cache.

[0.2.1]: https://github.com/FadiBadarni/iris/releases/tag/v0.2.1
