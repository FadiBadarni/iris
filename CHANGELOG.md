# Changelog

All notable changes to iris are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
