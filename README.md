# iris

> **Status: v0.4.0 is on npm (`iris-cc`); v0.5 is in progress — persistent `iris-daemon` for sub-200ms hook latency has landed on `main`. The v0.5 publish lands once ε cuts; until then, install via `pnpm link` from a local clone or `pnpm add -D github:FadiBadarni/iris`.**

Claude Code writes `bg-[#f3f4f6]` when your theme defines `bg-muted`. It picks `p-[13px]` instead of the spacing scale you spent two days defining. It generates a fresh `<Button>` even though `shadcn add button` is already in your tree. You catch some of this in PR review. Most of it ships.

iris stops the leak before it lands.

## What it does

iris reads your Tailwind config or `globals.css @theme` block, learns your project's actual tokens and scale, and grounds AI coding assistants in that reality. Six surfaces, layered on one engine:

- A **CLI** (`npx iris lint`) that flags arbitrary Tailwind values and suggests the correct token. Wraps `eslint-plugin-tailwindcss` and adds full Tailwind v4 `@theme` parsing, semantic rewriting, and a sane allowlist for legitimate arbitrary values like `bg-[url(...)]` and `grid-cols-[1fr_2fr]`. **Shipped.**
- A **programmatic API** (`import { lintSource } from "iris-cc"`) — the same engine the CLI uses, exposed for adapter code. **Shipped.**
- A **Claude Code PreToolUse hook** (`iris-hook`) that intercepts Write/Edit/MultiEdit and blocks off-token classes before they hit disk. The block's `reason` payload carries the suggestion, so the AI rewrites the diff in the same turn. Backed by a persistent `iris-daemon` for sub-200ms warm calls (see [Performance](#performance)). **Shipped.**
- An **MCP server** (`iris-mcp`) exposing the engine as four tools — `lint_source`, `list_components`, `apply_fix`, `get_token_map` — so editors that speak MCP (Cursor, Windsurf, Zed, Claude Code) can call them on demand. **Shipped.**
- A **shadcn awareness layer** that detects installed shadcn/ui components, flags reinvented locals (`function Button() {...}` when `@/components/ui/button` already exists), and exposes the component list to the AI via MCP. **Shipped in v0.3.0.**
- An **`iris.config.ts`** at the project root with per-rule severity overrides (`off` / `warn` / `error`) and user-customizable allowlist patterns. Same file picked up by the CLI, hook, and MCP server. **Shipped in v0.4.**

Output of `npx iris lint app/components/Hero.tsx`:

```
app/components/Hero.tsx
  12:18  error  bg-[#f3f4f6] is not a token. did you mean bg-muted?
  18:24  error  text-[14px] is off-scale. did you mean text-sm? (near match, 1px off)

2 errors, 0 warnings
```

Run `npx iris lint --fix` to apply suggestions in place. With shadcn/ui detected in the project, iris adds a third diagnostic kind:

```
app/components/Hero.tsx
   3:8   warning  Reinventing <Button>. shadcn/ui already has @/components/ui/button. Import it instead of redefining.
```

## Roadmap

| Version | Scope | Status |
|---|---|---|
| v0.1 | `npx iris lint` CLI — Tailwind v3 + v4 parsing, allowlist, semantic rewriting, `--fix` | shipped to `main` |
| v0.2.1 | Public `lintSource` contract, `iris-hook` (PreToolUse), `iris-mcp` (`lint_source` tool) | shipped to `main` |
| v0.2.2 | OKLab near-match suggestions, `--fix` git-state safety | shipped to `main` |
| v0.3.0 | shadcn awareness — `parseShadcn`, `iris/no-reinventing-shadcn` rule, `list_components` MCP tool | tagged on `main` |
| v0.4.0 | `iris.config.ts` + `apply_fix` + `get_token_map` MCP tools | published to npm |
| v0.5 α | `iris-daemon` — persistent process holding warm caches over loopback HTTP | shipped to `main` |
| v0.5 β | chokidar watchers for live theme/config invalidation | shipped to `main` |
| v0.5 γ | `iris-daemon status` / `stop` lifecycle commands + `IRIS_NO_DAEMON` opt-out | shipped to `main` |
| v0.5 δ/ε | Docs + npm publish | in progress |

A Playwright + Vision visual QA loop and an edit-watching taste profile were considered and deferred. See [CLAUDE.md](CLAUDE.md) for the full spec.

## Why this exists

Existing tools each cover part of the problem.

- `eslint-plugin-tailwindcss` lints classes after they're written. iris wraps it and moves the gate to the AI generation boundary, where the cheap fix is.
- v0.dev and Magic Patterns generate good-looking components in their sandbox, then lose every token the moment you copy them into a real repo.
- Fragments governs design systems at the org level. iris is for the indie or small-team Tailwind project that wants the AI to behave today, not after a procurement cycle.

iris is opinionated: Tailwind, Next.js, shadcn-friendly, MCP-first. If you don't fit that, this isn't your tool.

## Programmatic API

The lint engine is a stable contract that adapters consume. The Claude Code pre-write hook, the MCP server, and the shadcn awareness layer are all thin transports over the same surface — anyone building custom tooling can call it directly.

```ts
import { lintSource, parseShadcn, parseTheme, type IrisLintMessage } from "iris-cc";

const theme = await parseTheme({ cwd: process.cwd() });
const shadcn = await parseShadcn({ cwd: process.cwd() });
const messages: IrisLintMessage[] = await lintSource(
  '<div className="bg-[#fa8072]" />',
  "Hero.tsx",
  theme,
  shadcn,
);

// messages[0] —
//   ruleId:    "tailwindcss/no-arbitrary-value"
//   classname: "bg-[#fa8072]"
//   suggestion: { kind: "exact", tokenName: "colors.brand.salmon", replacement: "bg-brand-salmon" }
```

`shadcn` is optional — drop the fourth argument and the `iris/no-reinventing-shadcn` rule stays unregistered, which is what you want on non-shadcn projects. `parseShadcn` does not throw on a missing shadcn install: it returns `{ components: new Map(), warnings: [{ kind: "no-shadcn", ... }] }` so the lint path can absorb the result silently.

The engine is also reachable via the `iris-cc/lint` subpath for adapter code that doesn't need `parseTheme` or the CLI surface:

```ts
import { lintSource, type IrisLintMessage } from "iris-cc/lint";
```

`IrisLintMessage` carries `line`, `column`, `severity`, `classname`, and a discriminated `suggestion` union (`exact | near | ambiguous | none`). Full shape lives in [`src/lint/types.ts`](src/lint/types.ts). `ShadcnComponent` (`{ name, filePath, importPath }`) and `ShadcnState` live in [`src/shadcn/types.ts`](src/shadcn/types.ts).

## Claude Code integration

iris ships a PreToolUse hook (`iris-hook`) that catches off-token writes before they land. Install the package and drop the hook into `.claude/settings.json`:

```bash
pnpm add -D iris-cc
```

The npm package is `iris-cc` (the bare `iris` name was already taken on the registry; `cc` evokes the Claude Code editor it's designed around). The bin names (`iris`, `iris-hook`, `iris-mcp`, `iris-daemon`) match the project name unchanged. `iris-cc@0.4.0` is the latest published; until v0.5 cuts you can install the in-progress version via `pnpm link` from a local clone or `pnpm add -D github:FadiBadarni/iris`.

Project-local config — `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          { "type": "command", "command": "npx iris-hook" }
        ]
      }
    ]
  }
}
```

When Claude generates a `<div className="bg-[#fa8072]" />`, the hook blocks the write and returns the iris suggestion (`bg-brand-salmon`) as the block reason. The AI applies the suggested token and the write goes through on the next turn.

The example skill at [`examples/claude-code/iris.skill.md`](examples/claude-code/iris.skill.md) nudges the AI toward token use *before* the hook fires; the hook is the hard gate when guidance fails. Both files are copy-paste ready.

## MCP server

`iris-mcp` exposes the engine over MCP so any compatible editor can call it on demand. Four tools ship today:

- `lint_source(source, filename, projectRoot?) → { violations: IrisLintMessage[] }` — the same lint pass the CLI runs, callable mid-reasoning. The hook is the hard gate during writes; this tool is what an AI calls *while planning* a Tailwind change.
- `apply_fix(source, filename, projectRoot?) → { source, applied, remaining }` — lint plus a server-side rewrite of every exact + near match suggestion. The AI submits a draft, gets corrected source back, and continues without round-tripping through the file system. `remaining` carries violations the engine had no fix for (ambiguous, no token match, or warning-only rules like `iris/no-reinventing-shadcn`).
- `list_components(projectRoot?) → { components: ShadcnComponent[] }` — the project's installed shadcn/ui components, each with `{ name, filePath, importPath }`. Lets the AI discover what's already imported and reach for it instead of generating a fresh `<Button>`.
- `get_token_map(projectRoot?) → { tokens: TokenEntry[] }` — every resolved Tailwind token, each with `{ name, value, type, source, file }`. Call before generating Tailwind classes so the AI reaches for project tokens instead of arbitrary values.

Claude Code — `~/.claude/mcp.json` or `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "iris": {
      "command": "npx",
      "args": ["-y", "-p", "iris-cc", "iris-mcp"]
    }
  }
}
```

The `-p iris-cc` is required because the npm package is `iris-cc` while the bin is `iris-mcp` — npx needs both names to resolve a global install. If `iris-cc` is already a project-local devDependency, `["-y", "iris-mcp"]` is enough since npx finds the bin in `node_modules`.

Cursor uses `~/.cursor/mcp.json` (or `.cursor/mcp.json`); Windsurf and Zed accept the same shape. Examples live under [`examples/mcp/`](examples/mcp/).

All four tools return both `content` (a JSON-encoded text block) and `structuredContent` for clients that index structured fields. The two write-shaped tools (`lint_source`, `apply_fix`) surface engine failures as `isError: true` so the AI sees actionable error messages. The two discovery tools (`list_components`, `get_token_map`) answer cleanly with empty arrays on projects that don't have the relevant install — the AI gets a "nothing here" signal and falls through to defaults rather than failing.

## Configuration

Drop an `iris.config.ts` (or `.mjs` / `.js`) at the project root. The CLI, hook, and MCP server all pick it up automatically — same file, three surfaces. A copy-paste-ready example lives at [`examples/iris.config.ts`](examples/iris.config.ts).

```ts
import { defineConfig } from "iris-cc";

export default defineConfig({
  rules: {
    "iris/no-reinventing-shadcn": "error",   // promote warning to a hard hook block
    "tailwindcss/no-arbitrary-value": "off", // silence end-to-end
  },
  allowlist: [
    "^bg-\\[hsl\\(",         // string pattern, compiled with new RegExp(...)
    /^text-\[var\(--app-/,   // RegExp literal works too
  ],
});
```

**Two knobs today:**

- **`rules`.** Per-rule severity overrides keyed by exact `IrisLintMessage.ruleId`. `"off"` silences a rule end-to-end. `"warn"` demotes an error so the hook stops blocking but the lint output still surfaces it. `"error"` promotes a warning so the hook *does* block. The loader rejects unknown severity strings (`"warning"` instead of `"warn"`, etc.) at startup rather than silently no-opping mid-lint.
- **`allowlist`.** Extra patterns appended to iris's `DEFAULT_ALLOWLIST`. Strings are compiled with `new RegExp(...)`; pass a literal RegExp if you want flag control. The `g` and `y` flags are stripped on user patterns since `RegExp.prototype.test` would otherwise carry `lastIndex` state between calls and let an allowlisted class leak on alternating matches.

**Surface posture.** The CLI surfaces config errors and exits 2 — broken config is fixable, the user invoked the linter intentionally and should see why. The hook and MCP swallow + log to stderr, falling back to defaults so a typo in `iris.config.ts` doesn't freeze every Claude Code tool call. Programmatic callers using `lintSource` directly can pass an `IrisConfig` as the fifth arg or skip it entirely; v0.3 behavior is preserved when the arg is omitted.

**Limitations today.** No way to *remove* a default allowlist pattern (only append). No `extends` for shared configs across a monorepo. No per-directory configs — project root only. All of these are additive knobs on the existing shape if real demand surfaces.

## shadcn awareness

When a project has shadcn/ui installed (detected via `components.json` or a `**/components/ui/*.{ts,tsx}` glob), iris steers the AI toward reusing the canonical exports. Two surfaces:

- **Lint rule.** `iris/no-reinventing-shadcn` flags a function or const named after an installed component when the file isn't already importing from the canonical alias path. The message embeds the import path, so the AI can self-correct in one turn:

  ```
  Reinventing <Button>. shadcn/ui already has @/components/ui/button. Import it instead of redefining.
  ```

  The rule fires on `function Button() {...}`, `const Button = () => ...`, and call-expression wrappers (`const Button = forwardRef(...)`, `memo(...)`) — the patterns AI assistants actually emit. It does **not** fire on the canonical implementation file itself, or on files that already `import { Button } from "@/components/ui/button"` (a value import). Type-only imports do **not** suppress, since they bring no usable value: `import type { Button } from "..."; function Button() {...}` still flags.

- **MCP tool.** `list_components` (above) lets the AI ask up front, before generating: "what components are already in this project?" Pair it with the lint rule for soft-then-hard layering — discovery first, warning when discovery is skipped.

Severity is `warning` end-to-end. The lint CLI surfaces shadcn warnings; the Claude Code hook intentionally only blocks errors, so a shadcn reinvention surfaces as coaching context (via the lint pass on the next read) rather than freezing the tool call.

**Monorepos.** When more than one `**/components/ui` directory is found and there's no `components.json` to disambiguate, the shallowest dir wins (depth-first, then lexicographic). Others surface as a `multi-shadcn` warning (`iris warn [multi-shadcn]: ...` from the CLI). Pass `projectRoot` to the MCP tool, or run iris from the package's directory, to scope detection to a single workspace.

**Opt-out.** v0.4 added a config-driven knob: drop `rules: { "iris/no-reinventing-shadcn": "off" }` into `iris.config.ts` (see [Configuration](#configuration)) and the rule disappears end-to-end. Detection itself still runs (used by `list_components` regardless), but the lint pass stays silent. Programmatic callers using `lintSource` directly can also opt out by omitting the fourth argument.

## Performance

The Claude Code hook fires on every Write/Edit/MultiEdit. Each fire used to spawn a fresh `iris-hook` process, parse `tailwind.config.ts`, walk for shadcn components, load `iris.config.ts`, and run lint — measured at 450–570ms cold. CLAUDE.md set a <200ms budget. v0.5 hits it.

**`iris-daemon`.** A long-running per-project process spawned on the first hook call, killed by an idle-out 10 minutes after the last call. Holds warm theme + shadcn + config caches across calls. Listens on a random loopback port; auth is a 32-byte token written to a mode-0o600 lock file at `<projectRoot>/.iris/daemon.json` (gitignore it). Subsequent hook calls read the lock, POST to `http://127.0.0.1:<port>/lint`, and exit — well under the budget for a typed character.

**File watchers.** chokidar watches the project root. Edits to `tailwind.config.{ts,js,mjs,cjs}`, any `.css` file in the tree, or `package.json` (where `detectVersion` reads the tailwind major) clear the theme cache. Edits to `iris.config.{ts,mjs,js}` clear the config cache. The next hook call sees fresh state without a daemon restart.

**Lifecycle commands** (run with `--project-root <path>` to target a specific root, defaults to cwd):

```bash
iris-daemon status   # is a daemon running here? what's its pid/port/uptime?
iris-daemon stop     # SIGTERM the daemon and clear its lock
```

A wedged daemon is rare — the next hook call detects a stale lock and respawns automatically. `stop` is for explicit cleanup (e.g. after `pnpm add iris-cc@<newer>` so the next hook spawns the new binary).

**Fallback.** Anything goes wrong on the daemon path — spawn fails, port unreachable, version mismatch, malformed response — the hook falls back to in-process lint. iris never blocks Claude Code on a daemon hiccup.

**Opt-out.** Set `IRIS_NO_DAEMON=1` in the hook's env to skip the daemon entirely and run every hook call in-process. Useful for sandboxed environments without process-spawn permission, or for an apples-to-apples baseline when filing an issue.

**Monorepos.** The hook walks up from the edited file looking for the first ancestor `tailwind.config.*` and uses that directory as the daemon's project root — covers Turborepo / Nx setups with a shared root config. `iris-daemon status` and `stop` default to the *current working directory*, so running them at the repo root may report "not running" while the hook is using a package-level Tailwind root. Pass `--project-root <path>` to target a specific root.

**Known limitations:**
- v4 CSS-first projects without a JS config won't trigger the daemon (the hook fast-fails when no ancestor `tailwind.config.*` is found from the edited file). Drop a stub `export default {}` to opt in.
- `clearCache()` clears the entire theme cache, not per-root. Two daemons running for different projects on the same machine will evict each other's caches when either project's theme changes — a perf cost, not a correctness issue.

## Install

Not on npm yet for v0.5 — `iris-cc@0.4.0` is the latest published. v0.5 lands when ε cuts.

In the meantime, for hands-on use:

```bash
git clone https://github.com/FadiBadarni/iris.git
cd iris && pnpm install && pnpm build
pnpm link --global   # then `pnpm link --global iris-cc` from your project
```

That makes `iris`, `iris lint`, and `iris-hook` available in the linked project, including from `.claude/settings.json`.

## Contributing

Solo work for now. Commit conventions live in [COMMITS.md](COMMITS.md). A `CONTRIBUTING.md` will land alongside the v0.5.0 npm publish.

## License

[MIT](LICENSE).
