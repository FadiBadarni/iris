# iris

> **Status: v0.3 α/β/γ are on `main` — lint engine, Claude Code hook, MCP server (`lint_source` + `list_components`), and shadcn awareness all ship. npm publish lands with v0.3 ε (release prep). Use locally via `pnpm link` or a git install in the meantime.**

Claude Code writes `bg-[#f3f4f6]` when your theme defines `bg-muted`. It picks `p-[13px]` instead of the spacing scale you spent two days defining. It generates a fresh `<Button>` even though `shadcn add button` is already in your tree. You catch some of this in PR review. Most of it ships.

iris stops the leak before it lands.

## What it does

iris reads your Tailwind config or `globals.css @theme` block, learns your project's actual tokens and scale, and grounds AI coding assistants in that reality. Five surfaces, layered on one engine:

- A **CLI** (`npx iris lint`) that flags arbitrary Tailwind values and suggests the correct token. Wraps `eslint-plugin-tailwindcss` and adds full Tailwind v4 `@theme` parsing, semantic rewriting, and a sane allowlist for legitimate arbitrary values like `bg-[url(...)]` and `grid-cols-[1fr_2fr]`. **Shipped.**
- A **programmatic API** (`import { lintSource } from "iris-cc"`) — the same engine the CLI uses, exposed for adapter code. **Shipped.**
- A **Claude Code PreToolUse hook** (`iris-hook`) that intercepts Write/Edit/MultiEdit and blocks off-token classes before they hit disk. The block's `reason` payload carries the suggestion, so the AI rewrites the diff in the same turn. **Shipped.**
- An **MCP server** (`iris-mcp`) exposing the engine as `lint_source` and `list_components` tools, so editors that speak MCP (Cursor, Windsurf, Zed, Claude Code) can call them on demand. **Shipped.**
- A **shadcn awareness layer** that detects installed shadcn/ui components, flags reinvented locals (`function Button() {...}` when `@/components/ui/button` already exists), and exposes the component list to the AI via MCP. **Shipped (v0.3 α/β/γ on `main`; δ/ε docs + release prep next).**

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
| v0.3 α | `parseShadcn` — detect installed components from `components.json` + glob | shipped to `main` |
| v0.3 β | `iris/no-reinventing-shadcn` lint rule wired through CLI / hook / MCP | shipped to `main` |
| v0.3 γ | `list_components` MCP tool for proactive AI queries | shipped to `main` |
| v0.3 δ/ε | Docs, version bump, npm publish | in progress |

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

The npm package is `iris-cc` (the bare `iris` name was already taken on the registry; `cc` evokes the Claude Code editor it's designed around). The bin names (`iris`, `iris-hook`, `iris-mcp`) match the project name unchanged. Until v0.3.0 publishes you can install via `pnpm link` from a local clone or `pnpm add -D github:FadiBadarni/iris`.

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

`iris-mcp` exposes the engine over MCP so any compatible editor can call it on demand. Two tools ship today:

- `lint_source(source, filename, projectRoot?) → { violations: IrisLintMessage[] }` — the same lint pass the CLI runs, callable mid-reasoning. The hook is the hard gate during writes; this tool is what an AI calls *while planning* a Tailwind change.
- `list_components(projectRoot?) → { components: ShadcnComponent[] }` — the project's installed shadcn/ui components, each with `{ name, filePath, importPath }`. Lets the AI discover what's already imported and reach for it instead of generating a fresh `<Button>`.

Claude Code — `~/.claude/mcp.json` or `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "iris": {
      "command": "npx",
      "args": ["-y", "iris-mcp"]
    }
  }
}
```

Cursor uses `~/.cursor/mcp.json` (or `.cursor/mcp.json`); Windsurf and Zed accept the same shape. Examples live under [`examples/mcp/`](examples/mcp/).

Both tools return `content` (a JSON-encoded text block) and `structuredContent` for clients that index structured fields. Engine failures on `lint_source` (no Tailwind project, parser crash) surface as `isError: true` with an actionable message. `list_components` answers cleanly with `components: []` on non-shadcn projects rather than failing — the AI gets a clear "no components" signal and falls through to default JSX generation.

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

**Opt-out.** Today there's no CLI/hook/MCP flag to disable shadcn detection — auto-wired everywhere a `components/ui/` directory or `components.json` is found. Programmatic callers can opt out by simply omitting the fourth `lintSource` argument. A config-driven opt-out can land in v0.4 if there's demand.

## Install

Not on npm yet. The first publish lands with v0.3 ε (release prep) once docs settle and the contract has been smoke-tested in a real Claude Code session.

In the meantime, for hands-on use:

```bash
git clone https://github.com/FadiBadarni/iris.git
cd iris && pnpm install && pnpm build
pnpm link --global   # then `pnpm link --global iris` from your project
```

That makes `iris`, `iris lint`, and `iris-hook` available in the linked project, including from `.claude/settings.json`.

## Contributing

Solo work for now. Commit conventions live in [COMMITS.md](COMMITS.md). A `CONTRIBUTING.md` will land alongside the v0.3.0 npm publish.

## License

[MIT](LICENSE).
