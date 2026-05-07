# iris

> **Status: v0.2.1 is code-complete on `main` — lint engine, Claude Code hook, and MCP server all ship. npm publish lands with slice δ (release prep). Use locally via `pnpm link` or a git install in the meantime.**

Claude Code writes `bg-[#f3f4f6]` when your theme defines `bg-muted`. It picks `p-[13px]` instead of the spacing scale you spent two days defining. It generates a fresh `<Button>` even though `shadcn add button` is already in your tree. You catch some of this in PR review. Most of it ships.

iris stops the leak before it lands.

## What it does

iris reads your Tailwind config or `globals.css @theme` block, learns your project's actual tokens and scale, and grounds AI coding assistants in that reality. Four surfaces, layered on one engine:

- A **CLI** (`npx iris lint`) that flags arbitrary Tailwind values and suggests the correct token. Wraps `eslint-plugin-tailwindcss` and adds full Tailwind v4 `@theme` parsing, semantic rewriting, and a sane allowlist for legitimate arbitrary values like `bg-[url(...)]` and `grid-cols-[1fr_2fr]`. **Shipped.**
- A **programmatic API** (`import { lintSource } from "iris"`) — the same engine the CLI uses, exposed for adapter code. **Shipped.**
- A **Claude Code PreToolUse hook** (`iris-hook`) that intercepts Write/Edit/MultiEdit and blocks off-token classes before they hit disk. The block's `reason` payload carries the suggestion, so the AI rewrites the diff in the same turn. **Shipped.**
- An **MCP server** (`iris-mcp`) exposing the engine as a `lint_source` tool, so editors that speak MCP (Cursor, Windsurf, Zed, Claude Code) can call it on demand. **In progress (v0.2.1 γ).**

A **shadcn awareness layer** that surfaces installed components for the AI to reuse instead of regenerate is the v0.3 target.

Output of `npx iris lint app/components/Hero.tsx`:

```
app/components/Hero.tsx
  12:18  error  bg-[#f3f4f6] is not a token. did you mean bg-muted?
  18:24  error  text-[14px] is off-scale. did you mean text-sm? (near match, 1px off)

2 errors, 0 warnings
```

Run `npx iris lint --fix` to apply suggestions in place. v0.3's shadcn awareness adds a third diagnostic kind — `warn  reinventing <button>. shadcn/ui already has @/components/ui/button` — and is not in the box yet.

## Roadmap

| Version | Scope | Status |
|---|---|---|
| v0.1 | `npx iris lint` CLI — Tailwind v3 + v4 parsing, allowlist, semantic rewriting, `--fix` | shipped to `main` |
| v0.2.1 α | Public `lintSource` + `IrisLintMessage` contract, `iris/lint` subpath export | shipped to `main` |
| v0.2.1 β | Claude Code PreToolUse hook (`iris-hook`), example settings + skill | shipped to `main` |
| v0.2.1 γ | MCP server (`iris-mcp`) for Cursor/Windsurf/Zed/Claude Code | shipped to `main` |
| v0.2.1 δ | npm publish, CHANGELOG, version bump | next |
| v0.3 | shadcn awareness — detect installed components, steer AI toward reuse | planned |

A Playwright + Vision visual QA loop and an edit-watching taste profile were considered and deferred. See [CLAUDE.md](CLAUDE.md) for the full spec.

## Why this exists

Existing tools each cover part of the problem.

- `eslint-plugin-tailwindcss` lints classes after they're written. iris wraps it and moves the gate to the AI generation boundary, where the cheap fix is.
- v0.dev and Magic Patterns generate good-looking components in their sandbox, then lose every token the moment you copy them into a real repo.
- Fragments governs design systems at the org level. iris is for the indie or small-team Tailwind project that wants the AI to behave today, not after a procurement cycle.

iris is opinionated: Tailwind, Next.js, shadcn-friendly, MCP-first. If you don't fit that, this isn't your tool.

## Programmatic API

The lint engine is a stable contract that adapters consume. The Claude Code pre-write hook and the MCP server (both shipping in v0.2.1) are thin transports over the same surface — anyone building custom tooling can call it directly.

```ts
import { lintSource, parseTheme, type IrisLintMessage } from "iris-cc";

const theme = await parseTheme({ cwd: process.cwd() });
const messages: IrisLintMessage[] = await lintSource(
  '<div className="bg-[#fa8072]" />',
  "Hero.tsx",
  theme,
);

// messages[0] —
//   ruleId:    "tailwindcss/no-arbitrary-value"
//   classname: "bg-[#fa8072]"
//   suggestion: { kind: "exact", tokenName: "colors.brand.salmon", replacement: "bg-brand-salmon" }
```

The engine is also reachable via the `iris-cc/lint` subpath for adapter code that doesn't need `parseTheme` or the CLI surface:

```ts
import { lintSource, type IrisLintMessage } from "iris-cc/lint";
```

`IrisLintMessage` carries `line`, `column`, `severity`, `classname`, and a discriminated `suggestion` union (`exact | near | ambiguous | none`). Full shape lives in [`src/lint/types.ts`](src/lint/types.ts).

## Claude Code integration

iris ships a PreToolUse hook (`iris-hook`) that catches off-token writes before they land. Install the package and drop the hook into `.claude/settings.json`:

```bash
pnpm add -D iris-cc
```

The npm package is `iris-cc` (the bare `iris` name was already taken on the registry; `cc` evokes the Claude Code editor it's designed around). The bin names (`iris`, `iris-hook`, `iris-mcp`) match the project name unchanged. Until v0.2.1 publishes you can install via `pnpm link` from a local clone or `pnpm add -D github:FadiBadarni/iris`.

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

`iris-mcp` exposes the same engine as a single MCP tool — `lint_source(source, filename, projectRoot?) → { violations: IrisLintMessage[] }` — so any MCP-capable editor can call it on demand. The hook is the hard gate during writes; the MCP tool is what an AI calls *while reasoning* about a Tailwind change ("does this class exist? is there a matching token?").

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

The tool returns both `content` (a JSON-encoded text block) and `structuredContent` for clients that index structured fields; engine failures (no Tailwind project, parser crash) surface as `isError: true` with an actionable message rather than an empty `violations` array.

## Install

Not on npm yet. The first publish lands with v0.2.1 once the MCP server adapter ships and the contract has been smoke-tested in a real Claude Code session.

In the meantime, for hands-on use:

```bash
git clone https://github.com/FadiBadarni/iris.git
cd iris && pnpm install && pnpm build
pnpm link --global   # then `pnpm link --global iris` from your project
```

That makes `iris`, `iris lint`, and `iris-hook` available in the linked project, including from `.claude/settings.json`.

## Contributing

Solo work for now. Commit conventions live in [COMMITS.md](COMMITS.md). A `CONTRIBUTING.md` will land alongside the v0.2.1 npm publish.

## License

[MIT](LICENSE).
